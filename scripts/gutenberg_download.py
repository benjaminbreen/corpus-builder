#!/usr/bin/env python3
"""
Project Gutenberg Downloader

Search and download plain-text public domain books from Project Gutenberg
via the Gutendex API.

Usage:
  python scripts/gutenberg_download.py --search "Hume Human Nature"
  python scripts/gutenberg_download.py --title "A Treatise of Human Nature"
  python scripts/gutenberg_download.py --id 4705
"""

import argparse
import re
from pathlib import Path
from typing import Optional

import requests

GUTENDEX_URL = "https://gutendex.com/books"


def normalize_title(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def choose_text_url(formats: dict) -> Optional[str]:
    if not formats:
        return None
    for key, url in formats.items():
        if key.startswith("text/plain; charset=utf-8"):
            return url
    for key, url in formats.items():
        if key.startswith("text/plain"):
            return url
    return None


def search_books(query: str, language: Optional[str], max_results: int) -> list[dict]:
    results = []
    next_url = f"{GUTENDEX_URL}?search={requests.utils.quote(query)}"

    while next_url and len(results) < max_results:
        resp = requests.get(next_url, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        for item in data.get("results", []):
            if language and language not in item.get("languages", []):
                continue
            results.append(item)
            if len(results) >= max_results:
                break

        next_url = data.get("next")

    return results


def select_best_match(results: list[dict], title: Optional[str]) -> Optional[dict]:
    if not results:
        return None
    if not title:
        return results[0]

    wanted = normalize_title(title)
    for r in results:
        if normalize_title(r.get("title", "")) == wanted:
            return r

    wanted_words = set(wanted.split())
    for r in results:
        candidate = normalize_title(r.get("title", ""))
        if wanted_words and wanted_words.issubset(set(candidate.split())):
            return r

    return results[0]


def download_text(url: str) -> Optional[str]:
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        print(f"Error downloading text: {e}")
        return None


def save_text(text: str, title: str, ebook_id: int, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    safe_title = re.sub(r"[^\w\s-]", "", title).strip()[:80]
    filename = f"{safe_title}_gutenberg_{ebook_id}.txt"
    path = output_dir / filename
    path.write_text(text, encoding="utf-8")
    return path


def main():
    parser = argparse.ArgumentParser(description="Download Project Gutenberg texts via Gutendex")
    parser.add_argument("--search", help="Search query")
    parser.add_argument("--title", help="Preferred title for best-match selection")
    parser.add_argument("--id", type=int, help="Gutenberg ebook ID (direct download)")
    parser.add_argument("--lang", default="en", help="Language code (default: en)")
    parser.add_argument("--max-results", type=int, default=20, help="Max search results to consider")
    parser.add_argument("--output", default="./gutenberg_output", help="Output directory")

    args = parser.parse_args()
    output_dir = Path(args.output)

    if not args.id and not args.search and not args.title:
        parser.print_help()
        return

    if args.id:
        url = f"{GUTENDEX_URL}/{args.id}"
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        book = resp.json()
    else:
        query = args.search or args.title
        results = search_books(query, args.lang, args.max_results)
        if not results:
            print("No results found.")
            return
        book = select_best_match(results, args.title)

    title = book.get("title", "gutenberg_text")
    ebook_id = book.get("id")
    formats = book.get("formats", {})

    text_url = choose_text_url(formats)
    if not text_url:
        print("No plain-text format available for this book.")
        return

    print(f"Downloading: {title} (ID {ebook_id})")
    text = download_text(text_url)
    if not text:
        return

    path = save_text(text, title, ebook_id, output_dir)
    print(f"Saved: {path}")
    print(f"Total characters: {len(text):,}")


if __name__ == "__main__":
    main()
