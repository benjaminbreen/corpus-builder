#!/usr/bin/env python3
"""
Google Books Public Domain PDF Downloader and OCR Tool

Downloads public domain books from Google Books and performs high-quality OCR.
Designed for early modern texts where Internet Archive DJVU quality is insufficient.

Usage:
    python google_books_ocr.py --book-id "BOOK_ID" --output-dir ./output
    python google_books_ocr.py --search "newton principia 1687" --output-dir ./output

Requirements:
    pip install requests pdf2image pytesseract Pillow tqdm
    # For Tesseract OCR: brew install tesseract tesseract-lang (macOS)
    # For better preprocessing: pip install opencv-python numpy
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import quote_plus

import requests
from tqdm import tqdm

# Optional imports with graceful fallback
try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False
    print("Warning: pdf2image not installed. Install with: pip install pdf2image")

try:
    import pytesseract
    HAS_TESSERACT = True
except ImportError:
    HAS_TESSERACT = False
    print("Warning: pytesseract not installed. Install with: pip install pytesseract")

try:
    import cv2
    import numpy as np
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    print("Note: opencv-python not installed. Image preprocessing will be limited.")

from PIL import Image, ImageFilter, ImageEnhance


class GoogleBooksDownloader:
    """Handles searching and downloading from Google Books."""

    BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes"

    def __init__(self, output_dir: str, api_key: Optional[str] = None):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Academic Research Bot'
        })

    def search_books(self, query: str, max_results: int = 10) -> list[dict]:
        """Search Google Books API for public domain books."""
        params = {
            'q': query,
            'filter': 'free-ebooks',  # Only public domain / free books
            'maxResults': max_results,
            'printType': 'books',
        }
        if self.api_key:
            params['key'] = self.api_key

        response = self.session.get(self.BOOKS_API_URL, params=params)
        response.raise_for_status()
        data = response.json()

        results = []
        for item in data.get('items', []):
            vol_info = item.get('volumeInfo', {})
            access_info = item.get('accessInfo', {})

            # Check if PDF is available
            pdf_info = access_info.get('pdf', {})
            epub_info = access_info.get('epub', {})

            results.append({
                'id': item.get('id'),
                'title': vol_info.get('title', 'Unknown'),
                'authors': vol_info.get('authors', ['Unknown']),
                'published_date': vol_info.get('publishedDate', 'Unknown'),
                'description': vol_info.get('description', '')[:200],
                'pdf_available': pdf_info.get('isAvailable', False),
                'pdf_link': pdf_info.get('downloadLink'),
                'epub_available': epub_info.get('isAvailable', False),
                'public_domain': access_info.get('publicDomain', False),
                'viewability': access_info.get('viewability'),
                'web_reader_link': access_info.get('webReaderLink'),
            })

        return results

    def get_book_info(self, book_id: str) -> dict:
        """Get detailed info for a specific book."""
        url = f"{self.BOOKS_API_URL}/{book_id}"
        params = {}
        if self.api_key:
            params['key'] = self.api_key

        response = self.session.get(url, params=params)
        response.raise_for_status()
        return response.json()

    def download_pdf(self, book_id: str, filename: Optional[str] = None) -> Optional[Path]:
        """
        Download a public domain book as PDF from Google Books.

        Google Books uses several URL patterns for PDF downloads:
        1. Direct API download link (if available)
        2. Content server URL pattern
        """
        book_info = self.get_book_info(book_id)
        access_info = book_info.get('accessInfo', {})
        vol_info = book_info.get('volumeInfo', {})

        # Check if it's actually downloadable
        if not access_info.get('publicDomain', False):
            print(f"Warning: Book {book_id} may not be public domain")

        viewability = access_info.get('viewability')
        if viewability not in ['ALL_PAGES', 'FULL_PUBLIC_DOMAIN']:
            print(f"Warning: Book viewability is '{viewability}' - may not be fully downloadable")

        # Try to get the PDF download link
        pdf_info = access_info.get('pdf', {})
        download_link = pdf_info.get('downloadLink')

        if not download_link:
            # Construct alternative download URL
            # Google Books content server pattern
            download_link = f"https://books.google.com/books/download/{quote_plus(vol_info.get('title', book_id))}.pdf?id={book_id}&output=pdf"

        # Prepare filename
        if not filename:
            safe_title = re.sub(r'[^\w\s-]', '', vol_info.get('title', book_id))[:50]
            filename = f"{safe_title}_{book_id}.pdf"

        output_path = self.output_dir / filename

        print(f"Downloading: {vol_info.get('title', book_id)}")
        print(f"URL: {download_link}")

        try:
            response = self.session.get(download_link, stream=True, timeout=60)
            response.raise_for_status()

            # Check if we got a PDF
            content_type = response.headers.get('content-type', '')
            if 'pdf' not in content_type.lower() and 'octet-stream' not in content_type.lower():
                print(f"Warning: Response may not be a PDF (content-type: {content_type})")

            total_size = int(response.headers.get('content-length', 0))

            with open(output_path, 'wb') as f:
                with tqdm(total=total_size, unit='B', unit_scale=True, desc="Downloading") as pbar:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                        pbar.update(len(chunk))

            # Verify the PDF
            if output_path.stat().st_size < 1000:
                print("Warning: Downloaded file is very small, may not be valid")
                with open(output_path, 'r', errors='ignore') as f:
                    content = f.read(500)
                    if 'html' in content.lower():
                        print("Error: Received HTML instead of PDF. Book may require authentication.")
                        output_path.unlink()
                        return None

            print(f"Saved to: {output_path}")
            return output_path

        except requests.exceptions.RequestException as e:
            print(f"Download failed: {e}")
            return None


class OCRProcessor:
    """High-quality OCR processing for historical documents."""

    def __init__(self, output_dir: str, dpi: int = 300, lang: str = 'eng'):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.dpi = dpi
        self.lang = lang  # Tesseract language(s), e.g., 'eng+lat' for English+Latin

    def preprocess_image(self, image: Image.Image) -> Image.Image:
        """
        Preprocess image for better OCR of historical texts.
        Handles common issues: yellowed paper, bleed-through, faded ink.
        """
        # Convert to grayscale
        if image.mode != 'L':
            image = image.convert('L')

        if HAS_CV2:
            # Advanced preprocessing with OpenCV
            img_array = np.array(image)

            # Denoise
            img_array = cv2.fastNlMeansDenoising(img_array, None, 10, 7, 21)

            # Adaptive thresholding (great for uneven lighting/yellowed pages)
            img_array = cv2.adaptiveThreshold(
                img_array, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 11, 2
            )

            # Optional: Deskew detection and correction
            # (can be added if needed)

            image = Image.fromarray(img_array)
        else:
            # Basic preprocessing with Pillow only
            # Increase contrast
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(2.0)

            # Sharpen
            image = image.filter(ImageFilter.SHARPEN)

            # Binarize (simple threshold)
            image = image.point(lambda x: 0 if x < 140 else 255)

        return image

    def ocr_image(self, image: Image.Image, preprocess: bool = True) -> str:
        """Perform OCR on a single image."""
        if not HAS_TESSERACT:
            raise RuntimeError("pytesseract not installed")

        if preprocess:
            image = self.preprocess_image(image)

        # Tesseract configuration for historical texts
        custom_config = r'--oem 3 --psm 1 -c preserve_interword_spaces=1'

        text = pytesseract.image_to_string(image, lang=self.lang, config=custom_config)
        return text

    def ocr_pdf(self, pdf_path: Path, save_images: bool = False) -> str:
        """
        OCR an entire PDF document.

        Args:
            pdf_path: Path to the PDF file
            save_images: If True, save preprocessed page images

        Returns:
            Full text of the document
        """
        if not HAS_PDF2IMAGE:
            raise RuntimeError("pdf2image not installed")

        print(f"Converting PDF to images at {self.dpi} DPI...")
        pages = convert_from_path(pdf_path, dpi=self.dpi)

        full_text = []
        images_dir = self.output_dir / f"{pdf_path.stem}_images"

        if save_images:
            images_dir.mkdir(exist_ok=True)

        print(f"Processing {len(pages)} pages...")
        for i, page in enumerate(tqdm(pages, desc="OCR Progress")):
            # Preprocess and OCR
            processed = self.preprocess_image(page)

            if save_images:
                processed.save(images_dir / f"page_{i+1:04d}.png")

            text = self.ocr_image(processed, preprocess=False)  # Already preprocessed
            full_text.append(f"\n--- Page {i+1} ---\n\n{text}")

        return '\n'.join(full_text)


def main():
    parser = argparse.ArgumentParser(
        description='Download and OCR public domain books from Google Books',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Search for books:
    python google_books_ocr.py --search "principia mathematica newton 1687"

  Download and OCR a specific book:
    python google_books_ocr.py --book-id "YVIOAAAAQAAJ" --ocr

  OCR an existing PDF:
    python google_books_ocr.py --pdf ./mybook.pdf --ocr

  For early modern Latin texts:
    python google_books_ocr.py --book-id "XXX" --ocr --lang "lat+eng"
        """
    )

    parser.add_argument('--search', type=str, help='Search query for Google Books')
    parser.add_argument('--book-id', type=str, help='Google Books volume ID')
    parser.add_argument('--pdf', type=str, help='Path to existing PDF to OCR')
    parser.add_argument('--output-dir', type=str, default='./google_books_output',
                        help='Output directory')
    parser.add_argument('--ocr', action='store_true', help='Perform OCR on downloaded PDF')
    parser.add_argument('--dpi', type=int, default=300, help='DPI for OCR (default: 300)')
    parser.add_argument('--lang', type=str, default='eng',
                        help='Tesseract language(s), e.g., eng+lat for English+Latin')
    parser.add_argument('--api-key', type=str, help='Google Books API key (optional)')
    parser.add_argument('--save-images', action='store_true',
                        help='Save preprocessed page images')

    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Search mode
    if args.search:
        downloader = GoogleBooksDownloader(output_dir, args.api_key)
        results = downloader.search_books(args.search)

        print(f"\nFound {len(results)} results:\n")
        for i, book in enumerate(results, 1):
            print(f"{i}. {book['title']}")
            print(f"   Authors: {', '.join(book['authors'])}")
            print(f"   Published: {book['published_date']}")
            print(f"   ID: {book['id']}")
            print(f"   Public Domain: {book['public_domain']}")
            print(f"   PDF Available: {book['pdf_available']}")
            print(f"   Viewability: {book['viewability']}")
            print()

        # Save results to JSON
        results_file = output_dir / 'search_results.json'
        with open(results_file, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"Results saved to: {results_file}")
        return

    # Download mode
    pdf_path = None
    if args.book_id:
        downloader = GoogleBooksDownloader(output_dir, args.api_key)
        pdf_path = downloader.download_pdf(args.book_id)
        if not pdf_path:
            print("Failed to download PDF")
            sys.exit(1)
    elif args.pdf:
        pdf_path = Path(args.pdf)
        if not pdf_path.exists():
            print(f"PDF not found: {pdf_path}")
            sys.exit(1)

    # OCR mode
    if args.ocr and pdf_path:
        if not HAS_TESSERACT or not HAS_PDF2IMAGE:
            print("Error: OCR requires pytesseract and pdf2image")
            print("Install with: pip install pytesseract pdf2image")
            print("Also install Tesseract: brew install tesseract tesseract-lang")
            sys.exit(1)

        processor = OCRProcessor(output_dir, dpi=args.dpi, lang=args.lang)

        print(f"\nStarting OCR with language: {args.lang}")
        text = processor.ocr_pdf(pdf_path, save_images=args.save_images)

        # Save output
        text_file = output_dir / f"{pdf_path.stem}_ocr.txt"
        with open(text_file, 'w', encoding='utf-8') as f:
            f.write(text)

        print(f"\nOCR complete! Output saved to: {text_file}")
        print(f"Total characters: {len(text):,}")

        # Show preview
        print("\n--- Preview (first 500 chars) ---")
        print(text[:500])

    elif not args.search and not args.book_id and not args.pdf:
        parser.print_help()


if __name__ == '__main__':
    main()
