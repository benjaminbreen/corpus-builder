#!/usr/bin/env python3
"""
Internet Archive PDF Downloader and OCR Tool

Downloads public domain books from Internet Archive and performs high-quality OCR.
IA actually allows direct PDF downloads unlike Google Books.

Usage:
    python ia_pdf_ocr.py --id "bub_gb_s6lSHDngPFoC" --output-dir ./output --ocr
    python ia_pdf_ocr.py --search "descartes discourse method" --output-dir ./output

Requirements:
    pip install requests pdf2image pytesseract Pillow tqdm internetarchive
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

import requests
from tqdm import tqdm

try:
    import internetarchive as ia
    HAS_IA = True
except ImportError:
    HAS_IA = False
    print("Note: internetarchive not installed. Install with: pip install internetarchive")

try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False

try:
    import pytesseract
    HAS_TESSERACT = True
except ImportError:
    HAS_TESSERACT = False

try:
    import cv2
    import numpy as np
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

from PIL import Image, ImageFilter, ImageEnhance


class IADownloader:
    """Downloads PDFs from Internet Archive."""

    def __init__(self, output_dir: str):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()

    def search(self, query: str, max_results: int = 10) -> list[dict]:
        """Search Internet Archive for texts."""
        if HAS_IA:
            search = ia.search_items(
                query,
                fields=['identifier', 'title', 'creator', 'date', 'language', 'mediatype'],
                params={'rows': max_results}
            )
            results = []
            for item in search:
                if item.get('mediatype') == 'texts':
                    results.append({
                        'identifier': item.get('identifier'),
                        'title': item.get('title', 'Unknown'),
                        'creator': item.get('creator', 'Unknown'),
                        'date': item.get('date', 'Unknown'),
                        'language': item.get('language', 'Unknown'),
                    })
            return results
        else:
            # Fallback to direct API
            url = "https://archive.org/advancedsearch.php"
            params = {
                'q': query,
                'fl[]': ['identifier', 'title', 'creator', 'date', 'language'],
                'rows': max_results,
                'output': 'json',
                'mediatype': 'texts'
            }
            resp = self.session.get(url, params=params)
            data = resp.json()
            return data.get('response', {}).get('docs', [])

    def get_pdf_url(self, identifier: str) -> Optional[str]:
        """Get the PDF download URL for an item."""
        # Check available files
        metadata_url = f"https://archive.org/metadata/{identifier}"
        resp = self.session.get(metadata_url)
        data = resp.json()

        files = data.get('files', [])
        pdf_files = [f for f in files if f.get('name', '').endswith('.pdf')]

        if pdf_files:
            # Prefer the main PDF (usually the largest or first one)
            pdf_files.sort(key=lambda x: x.get('size', 0), reverse=True)
            pdf_name = pdf_files[0]['name']
            return f"https://archive.org/download/{identifier}/{pdf_name}"

        return None

    def download_pdf(self, identifier: str) -> Optional[Path]:
        """Download a PDF from Internet Archive."""
        print(f"Fetching metadata for: {identifier}")

        # Get item info
        metadata_url = f"https://archive.org/metadata/{identifier}"
        resp = self.session.get(metadata_url)
        data = resp.json()

        metadata = data.get('metadata', {})
        title = metadata.get('title', identifier)
        print(f"Title: {title}")

        # Find PDF file
        pdf_url = self.get_pdf_url(identifier)
        if not pdf_url:
            print("No PDF found for this item. Trying to generate one...")
            # IA can generate PDFs on the fly
            pdf_url = f"https://archive.org/download/{identifier}/{identifier}.pdf"

        print(f"Downloading from: {pdf_url}")

        # Download with progress bar
        safe_title = re.sub(r'[^\w\s-]', '', title)[:50]
        filename = f"{safe_title}_{identifier}.pdf"
        output_path = self.output_dir / filename

        try:
            resp = self.session.get(pdf_url, stream=True, timeout=120)
            resp.raise_for_status()

            total_size = int(resp.headers.get('content-length', 0))

            with open(output_path, 'wb') as f:
                with tqdm(total=total_size, unit='B', unit_scale=True, desc="Downloading") as pbar:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
                        pbar.update(len(chunk))

            # Verify it's a PDF
            with open(output_path, 'rb') as f:
                header = f.read(10)
                if not header.startswith(b'%PDF'):
                    print("Error: Downloaded file is not a valid PDF")
                    output_path.unlink()
                    return None

            print(f"Saved to: {output_path}")
            return output_path

        except Exception as e:
            print(f"Download failed: {e}")
            return None


class OCRProcessor:
    """High-quality OCR for historical documents."""

    def __init__(self, output_dir: str, dpi: int = 300, lang: str = 'eng'):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.dpi = dpi
        self.lang = lang

    def preprocess_image(self, image: Image.Image) -> Image.Image:
        """Preprocess image for better OCR."""
        if image.mode != 'L':
            image = image.convert('L')

        if HAS_CV2:
            img_array = np.array(image)
            img_array = cv2.fastNlMeansDenoising(img_array, None, 10, 7, 21)
            img_array = cv2.adaptiveThreshold(
                img_array, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 11, 2
            )
            image = Image.fromarray(img_array)
        else:
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(2.0)
            image = image.filter(ImageFilter.SHARPEN)
            image = image.point(lambda x: 0 if x < 140 else 255)

        return image

    def ocr_pdf(self, pdf_path: Path, max_pages: int = None) -> str:
        """OCR a PDF document."""
        if not HAS_PDF2IMAGE or not HAS_TESSERACT:
            raise RuntimeError("pdf2image and pytesseract required")

        print(f"Converting PDF to images at {self.dpi} DPI...")

        kwargs = {'dpi': self.dpi}
        if max_pages:
            kwargs['last_page'] = max_pages

        pages = convert_from_path(pdf_path, **kwargs)

        full_text = []
        print(f"Processing {len(pages)} pages...")

        for i, page in enumerate(tqdm(pages, desc="OCR Progress")):
            processed = self.preprocess_image(page)
            text = pytesseract.image_to_string(
                processed, lang=self.lang,
                config='--oem 3 --psm 1 -c preserve_interword_spaces=1'
            )
            full_text.append(f"\n--- Page {i+1} ---\n\n{text}")

        return '\n'.join(full_text)


def main():
    parser = argparse.ArgumentParser(description='Download and OCR from Internet Archive')
    parser.add_argument('--search', type=str, help='Search query')
    parser.add_argument('--id', type=str, help='Internet Archive identifier')
    parser.add_argument('--output-dir', type=str, default='./ia_output')
    parser.add_argument('--ocr', action='store_true', help='Perform OCR')
    parser.add_argument('--dpi', type=int, default=300)
    parser.add_argument('--lang', type=str, default='eng')
    parser.add_argument('--max-pages', type=int, help='Limit pages to OCR')

    args = parser.parse_args()

    downloader = IADownloader(args.output_dir)

    if args.search:
        results = downloader.search(args.search)
        print(f"\nFound {len(results)} results:\n")
        for i, item in enumerate(results, 1):
            print(f"{i}. {item.get('title', 'Unknown')}")
            print(f"   Creator: {item.get('creator', 'Unknown')}")
            print(f"   Date: {item.get('date', 'Unknown')}")
            print(f"   ID: {item.get('identifier')}")
            print()
        return

    if args.id:
        pdf_path = downloader.download_pdf(args.id)
        if not pdf_path:
            sys.exit(1)

        if args.ocr:
            processor = OCRProcessor(args.output_dir, args.dpi, args.lang)
            text = processor.ocr_pdf(pdf_path, args.max_pages)

            text_file = Path(args.output_dir) / f"{pdf_path.stem}_ocr.txt"
            with open(text_file, 'w', encoding='utf-8') as f:
                f.write(text)

            print(f"\nOCR complete! Saved to: {text_file}")
            print(f"Total characters: {len(text):,}")
            print("\n--- Preview ---")
            print(text[:1000])


if __name__ == '__main__':
    main()
