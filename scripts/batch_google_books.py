#!/usr/bin/env python3
"""
Batch processor for Google Books downloads and OCR.
Reads from google_books_list.json and processes multiple books.

Usage:
    python batch_google_books.py                    # Process all books
    python batch_google_books.py --ids ID1 ID2     # Process specific IDs
    python batch_google_books.py --download-only   # Just download, no OCR
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
LIST_FILE = SCRIPT_DIR / "google_books_list.json"
OCR_SCRIPT = SCRIPT_DIR / "google_books_ocr.py"


def load_book_list():
    with open(LIST_FILE) as f:
        return json.load(f)


def process_book(book: dict, output_dir: Path, ocr: bool = True):
    """Process a single book."""
    book_id = book["id"]
    lang = book.get("ocr_lang", book.get("language", "eng"))

    print(f"\n{'='*60}")
    print(f"Processing: {book['title']}")
    print(f"Author: {book['author']}")
    print(f"ID: {book_id}")
    print(f"Language: {lang}")
    print(f"{'='*60}\n")

    cmd = [
        sys.executable,
        str(OCR_SCRIPT),
        "--book-id", book_id,
        "--output-dir", str(output_dir),
        "--lang", lang,
        "--dpi", "250"
    ]

    if ocr:
        cmd.append("--ocr")

    result = subprocess.run(cmd)
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(description="Batch process Google Books")
    parser.add_argument("--ids", nargs="+", help="Specific book IDs to process")
    parser.add_argument("--output-dir", default="./google_books_output",
                        help="Output directory")
    parser.add_argument("--download-only", action="store_true",
                        help="Download PDFs without OCR")
    parser.add_argument("--list", action="store_true",
                        help="List available books and exit")
    args = parser.parse_args()

    data = load_book_list()
    books = data["books"]

    if args.list:
        print("Available books:\n")
        for book in books:
            verified = "✓" if book.get("verified") else "?"
            print(f"  {verified} [{book['id']}] {book['title']} ({book['year']})")
            print(f"      Topic: {book['topic']} | Lang: {book.get('language', 'eng')}")
        return

    # Filter to specific IDs if provided
    if args.ids:
        books = [b for b in books if b["id"] in args.ids]
        if not books:
            print(f"No books found with IDs: {args.ids}")
            sys.exit(1)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    successes = []
    failures = []

    for book in books:
        try:
            if process_book(book, output_dir, ocr=not args.download_only):
                successes.append(book["title"])
            else:
                failures.append(book["title"])
        except Exception as e:
            print(f"Error processing {book['title']}: {e}")
            failures.append(book["title"])

    print("\n" + "="*60)
    print("BATCH PROCESSING COMPLETE")
    print("="*60)
    print(f"Successful: {len(successes)}")
    for title in successes:
        print(f"  ✓ {title}")
    if failures:
        print(f"Failed: {len(failures)}")
        for title in failures:
            print(f"  ✗ {title}")


if __name__ == "__main__":
    main()
