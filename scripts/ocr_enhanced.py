#!/usr/bin/env python3
"""
Enhanced OCR for historical documents with advanced preprocessing.

Improvements over basic OCR:
- Higher DPI (400)
- Advanced OpenCV preprocessing (denoising, deskewing, adaptive threshold)
- Watermark removal
- Better Tesseract config for historical texts
- Optional paragraph joining

Usage:
    python ocr_enhanced.py --pdf ./book.pdf --output ./output.txt --dpi 400
"""

import argparse
import re
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from pdf2image import convert_from_path
import pytesseract
from tqdm import tqdm


def deskew_image(image: np.ndarray) -> np.ndarray:
    """Deskew a slightly rotated image."""
    # Find all non-zero points (text)
    coords = np.column_stack(np.where(image < 128))
    if len(coords) < 100:
        return image

    # Find the minimum area rectangle
    try:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        elif angle > 45:
            angle = angle - 90

        # Only correct small angles
        if abs(angle) > 5:
            return image

        # Rotate to deskew
        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(image, M, (w, h),
                                  flags=cv2.INTER_CUBIC,
                                  borderMode=cv2.BORDER_REPLICATE)
        return rotated
    except:
        return image


def remove_watermarks(image: np.ndarray) -> np.ndarray:
    """Remove light watermarks (like 'Digitized by Google')."""
    # Watermarks are typically light gray - we can threshold them out
    # by making the threshold more aggressive for light areas

    # Create a mask for very light areas (potential watermarks)
    _, light_mask = cv2.threshold(image, 240, 255, cv2.THRESH_BINARY)

    # Dilate to expand watermark regions slightly
    kernel = np.ones((3, 3), np.uint8)
    light_mask = cv2.dilate(light_mask, kernel, iterations=1)

    # Set watermark areas to white
    result = image.copy()
    result[light_mask == 255] = 255

    return result


def auto_crop_margins(image: np.ndarray, pad: int = 20) -> np.ndarray:
    """
    Crop margins by finding the bounding box of text-like pixels.
    """
    # Invert so text is white on black
    _, thresh = cv2.threshold(image, 200, 255, cv2.THRESH_BINARY_INV)
    coords = cv2.findNonZero(thresh)
    if coords is None:
        return image
    x, y, w, h = cv2.boundingRect(coords)
    if w < 50 or h < 50:
        return image
    x0 = max(x - pad, 0)
    y0 = max(y - pad, 0)
    x1 = min(x + w + pad, image.shape[1])
    y1 = min(y + h + pad, image.shape[0])
    return image[y0:y1, x0:x1]


def preprocess_historical(image: Image.Image,
                          denoise_strength: int = 10,
                          remove_watermark: bool = True,
                          auto_crop: bool = True) -> Image.Image:
    """
    Advanced preprocessing for historical printed documents.

    Steps:
    1. Convert to grayscale
    2. Remove watermarks
    3. Denoise (non-local means)
    4. Deskew if needed
    5. Adaptive thresholding (handles uneven lighting/yellowed paper)
    6. Morphological cleanup
    """
    # Convert PIL to numpy array
    if image.mode != 'L':
        image = image.convert('L')
    img = np.array(image)

    # Step 1: Remove watermarks (before other processing)
    if remove_watermark:
        img = remove_watermarks(img)

    # Step 2: Denoise using Non-local Means
    # This is excellent for scanned documents
    img = cv2.fastNlMeansDenoising(img, None, denoise_strength, 7, 21)

    # Step 3: Increase contrast using CLAHE
    # (Contrast Limited Adaptive Histogram Equalization)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    img = clahe.apply(img)

    # Step 4: Auto-crop margins to reduce gutter noise
    if auto_crop:
        img = auto_crop_margins(img, pad=20)

    # Step 5: Deskew if slightly rotated
    img = deskew_image(img)

    # Step 6: Adaptive thresholding
    # This handles uneven lighting much better than global threshold
    img = cv2.adaptiveThreshold(
        img, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        15,  # Block size (odd number)
        4    # Constant subtracted from mean
    )

    # Step 7: Morphological operations to clean up
    # Small opening to remove noise dots
    kernel_small = np.ones((1, 1), np.uint8)
    img = cv2.morphologyEx(img, cv2.MORPH_OPEN, kernel_small)

    # Small closing to connect broken characters
    img = cv2.morphologyEx(img, cv2.MORPH_CLOSE, kernel_small)

    return Image.fromarray(img)


def ocr_page(image: Image.Image, lang: str = 'eng') -> str:
    """
    OCR a single page with optimized Tesseract settings.
    """
    # Tesseract config optimized for historical printed text
    config = (
        '--oem 3 '           # LSTM + legacy engine (best accuracy)
        '--psm 1 '           # Auto page segmentation with OSD
        '-c tessedit_char_whitelist="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?\'\"-()[] " '
        '-c preserve_interword_spaces=1 '
        '-c textord_heavy_nr=1 '  # More aggressive noise removal
    )

    # Actually, the whitelist is too restrictive. Let's use a simpler config:
    config = (
        '--oem 3 '           # LSTM neural net mode
        '--psm 1 '           # Auto page segmentation with OSD
        '-c preserve_interword_spaces=1 '
    )

    text = pytesseract.image_to_string(image, lang=lang, config=config)
    return text


def clean_ocr_text(text: str) -> str:
    """
    Post-process OCR text to fix common issues.
    """
    # Remove common watermarks (expanded patterns)
    watermarks = [
        r'[Dd]igiti[sz]ed\s+by\s+[Gg]oo+g?l?e?',
        r'[Gg]oo+g?l?e?\s*[Cc]?',  # Matches Gooale, Google, Goo, etc.
        r'ceneesey\s+GOORlE',
        r'cigueeary\s+GOOGLE',
        r'cigtizea\s+ty\s+GOORTE',
        r'ogneeary\s+GOORLe',
        r'viatizcay\s+GOOLE',
        r'\bGoo\s*a\s*le\b',
        r'\ble\s+Goo\s+u\b',
        r'\bshee\s+Goo\s+a\b',
        r'C\s*WOO\)?\s*ale',
        r'\bGooale\b',
        r'\bGOOLE\b',
        r'\bGOORLE\b',
        r'\bGOORlE\b',
        r'\.\s*Goo\s*a\s*le\.?',
        r'\.\s*le\s+Goo\s+u\.?',
        r'\bale\s*Cc?\b',  # Fragment at end of line
        r'\bshee\b',       # Fragment
        r'\ble\s*$',       # "le" at end of paragraph
        r'^\s*ale\s*$',    # "ale" on its own line
        r'\.\s*ale\s*$',   # ".ale" at end
        r'\.\s*le\s*$',    # ".le" at end
    ]
    for pattern in watermarks:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.MULTILINE)

    # Fix common OCR errors for historical texts
    replacements = [
        (r'\bf\s?i\s?r\s?s\s?t\b', 'first'),  # Spaced out words
        (r'\bť\b', 'the'),
        (r'ſ', 's'),  # Long s
        (r'ﬀ', 'ff'),  # Ligatures
        (r'ﬁ', 'fi'),
        (r'ﬂ', 'fl'),
        (r'æ', 'ae'),
        (r'œ', 'oe'),
        # Fix mangled "Descartes" from small caps (comprehensive)
        (r'\bD[EeZzUuxXi][Ss]c[Aa]r[Tt][EeZzUu][Ss]\b', 'Descartes'),
        (r'\bDescarrss\b', 'Descartes'),
        (r'\bDzscarrss\b', 'Descartes'),
        (r'\bDzscarres\b', 'Descartes'),
        (r'\bDxscartes\b', 'Descartes'),
        (r'\bDescaRrEs\b', 'Descartes'),
        (r'\bDuscarTEs\b', 'Descartes'),
        (r'\bDescartgs\b', 'Descartes'),
        (r'\bDEscARTES\b', 'Descartes'),
        (r'\bDescanrrus\b', 'Descartes'),
        (r'\bDrscartEs\b', 'Descartes'),
        (r'\bDxEs\s*carves\b', 'Descartes'),
        (r'\bDescarres\b', 'Descartes'),
        # Fix split words from hyphenation
        (r'(\w+)\s+(\w+)ment\b', r'\1\2ment'),  # judg ment -> judgment
        (r'\bPhilo\s+sophy\b', 'Philosophy'),
        (r'\bex\s+clusions\b', 'exclusions'),
        (r'\bin\s+clusions\b', 'inclusions'),
        (r'\bde\s+termining\b', 'determining'),
        (r'\bde\s+termine\b', 'determine'),
        (r'\bcon\s+tains\b', 'contains'),
        (r'\bSyn\s+thesis\b', 'Synthesis'),
        (r'\bKnow\s+ledge\b', 'Knowledge'),
        (r'\bun\s+certain\b', 'uncertain'),
        (r'\bCar\s+tesianism\b', 'Cartesianism'),
        (r'\bre\s+ference\b', 'reference'),
        (r'\brepre\s+sentations\b', 'representations'),
        (r'\bimpos\s+sible\b', 'impossible'),
        (r'\bThink\s+ing\b', 'Thinking'),
        # Fix mangled "Method" from small caps
        (r'\bM[Ee][Tt][Hh][Oo][Pp]\b', 'Method'),
        (r'\bMeEtHop\b', 'Method'),
        (r'\bMErHop\b', 'Method'),
        # Fix roman numerals that got mangled
        (r'\bXvii\b', 'xvii'),
        (r'\bXviii\b', 'xviii'),
        (r'\bXix\b', 'xix'),
        (r'\bXx\b', 'xx'),
        (r'\bXxi\b', 'xxi'),
        (r'\bXxii\b', 'xxii'),
        (r'\bXViit\b', 'xvii'),
        (r'\bXvit\b', 'xvi'),
        (r'\s+([.,;:!?])', r'\1'),  # Space before punctuation
        (r'([.,;:!?])([A-Za-z])', r'\1 \2'),  # Missing space after punctuation
        (r'\n{3,}', '\n\n'),  # Multiple newlines
        (r'[ \t]+', ' '),  # Multiple spaces
        (r'^\s+', '', ),  # Leading whitespace on lines
    ]

    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text)

    # Remove isolated single characters (OCR noise)
    text = re.sub(r'\n[a-zA-Z]\n', '\n', text)

    return text.strip()


def join_paragraphs(text: str) -> str:
    """
    Join lines that were broken due to page width.
    Preserves paragraph breaks (double newlines).
    """
    lines = text.split('\n')
    result = []
    current_para = []

    for line in lines:
        line = line.strip()

        if not line:
            # Empty line = paragraph break
            if current_para:
                result.append(' '.join(current_para))
                current_para = []
            continue

        # Check if this line continues the previous
        if current_para:
            prev_line = current_para[-1]
            # If previous line ends with hyphen, join directly
            if prev_line.endswith('-'):
                current_para[-1] = prev_line[:-1]  # Remove hyphen
                current_para.append(line)
            # If previous line doesn't end with sentence-ending punctuation
            elif not prev_line[-1] in '.!?:':
                current_para.append(line)
            else:
                # New sentence, but might still be same paragraph
                current_para.append(line)
        else:
            current_para.append(line)

    if current_para:
        result.append(' '.join(current_para))

    return '\n\n'.join(result)


def process_pdf(pdf_path: Path,
                output_path: Path,
                dpi: int = 400,
                lang: str = 'eng',
                join_lines: bool = True,
                max_pages: int = None,
                save_debug_images: bool = False,
                auto_crop: bool = True) -> str:
    """
    Process a PDF with enhanced OCR.
    """
    print(f"Converting PDF to images at {dpi} DPI...")

    kwargs = {'dpi': dpi}
    if max_pages:
        kwargs['last_page'] = max_pages

    pages = convert_from_path(pdf_path, **kwargs)

    debug_dir = output_path.parent / f"{output_path.stem}_debug"
    if save_debug_images:
        debug_dir.mkdir(exist_ok=True)

    full_text = []
    print(f"Processing {len(pages)} pages with enhanced OCR...")

    for i, page in enumerate(tqdm(pages, desc="OCR")):
        # Preprocess with advanced techniques
        processed = preprocess_historical(page, auto_crop=auto_crop)

        if save_debug_images:
            processed.save(debug_dir / f"page_{i+1:04d}.png")

        # OCR
        text = ocr_page(processed, lang=lang)

        # Clean up
        text = clean_ocr_text(text)

        full_text.append(f"\n--- Page {i+1} ---\n\n{text}")

    result = '\n'.join(full_text)

    # Optionally join paragraphs
    if join_lines:
        # Process page by page to preserve page markers
        pages_text = result.split('\n--- Page ')
        joined_pages = [pages_text[0]]  # First part (empty or header)
        for page_text in pages_text[1:]:
            # Split off the page number line
            lines = page_text.split('\n', 2)
            if len(lines) >= 3:
                page_header = f"--- Page {lines[0]}\n{lines[1]}"
                content = lines[2] if len(lines) > 2 else ""
                joined_content = join_paragraphs(content)
                joined_pages.append(f"{page_header}\n{joined_content}")
            else:
                joined_pages.append(page_text)
        result = '\n'.join(joined_pages)

    # Save
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(result)

    print(f"\nSaved to: {output_path}")
    print(f"Total characters: {len(result):,}")

    return result


def main():
    parser = argparse.ArgumentParser(description='Enhanced OCR for historical documents')
    parser.add_argument('--pdf', required=True, help='Input PDF path')
    parser.add_argument('--output', help='Output text file path')
    parser.add_argument('--dpi', type=int, default=400, help='DPI for rendering (default: 400)')
    parser.add_argument('--lang', default='eng', help='Tesseract language (default: eng)')
    parser.add_argument('--max-pages', type=int, help='Limit pages to process')
    parser.add_argument('--no-join', action='store_true', help='Do not join paragraph lines')
    parser.add_argument('--no-crop', action='store_true', help='Disable auto-cropping of margins')
    parser.add_argument('--debug-images', action='store_true', help='Save preprocessed images')

    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}")
        sys.exit(1)

    output_path = Path(args.output) if args.output else pdf_path.with_suffix('.enhanced_ocr.txt')

    process_pdf(
        pdf_path,
        output_path,
        dpi=args.dpi,
        lang=args.lang,
        join_lines=not args.no_join,
        max_pages=args.max_pages,
        save_debug_images=args.debug_images,
        auto_crop=not args.no_crop
    )


if __name__ == '__main__':
    main()
