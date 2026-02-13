#!/usr/bin/env python3
"""
Priority Text Fetcher

Try to fetch a clean public-domain text using a source priority:
Wikisource -> Gutenberg -> (HathiTrust metadata only) -> Internet Archive (not automated here).

Usage:
  python scripts/priority_text_fetch.py --title "A Treatise of Human Nature"
  python scripts/priority_text_fetch.py --query "Hume Human Nature"
"""

import argparse
import re
import sys
from pathlib import Path
from typing import Optional

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from wikisource_download import WikisourceDownloader  # noqa: E402

GUTENDEX_URL = "https://gutendex.com/books"


def normalize_title(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def wikisource_search(query: str, lang: str, limit: int) -> list[str]:
    downloader = WikisourceDownloader(lang=lang)
    params = {
        "action": "query",
        "list": "search",
        "srsearch": query,
        "srnamespace": 0,
        "srlimit": limit,
        "format": "json",
    }
    resp = downloader.session.get(downloader.api_url, params=params)
    resp.raise_for_status()
    data = resp.json()
    results = data.get("query", {}).get("search", [])
    return [r["title"] for r in results]


def wikisource_safe_path(title: str, output_dir: Path) -> Path:
    safe_title = re.sub(r"[^\w\s-]", "", title)[:50]
    return output_dir / f"{safe_title}_wikisource.txt"


def try_wikisource(title: Optional[str], query: Optional[str], lang: str, output_dir: Path, limit: int) -> Optional[Path]:
    downloader = WikisourceDownloader(lang=lang)
    candidates = []

    if title:
        candidates.append(title)
    if query:
        candidates.extend(wikisource_search(query, lang, limit))

    seen = set()
    for cand in candidates:
        if cand in seen:
            continue
        seen.add(cand)
        print(f"Trying Wikisource: {cand}")
        text = downloader.download_work(cand, output_dir)
        if text:
            return wikisource_safe_path(cand, output_dir)

    return None


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


def gutenberg_search(query: str, language: Optional[str], max_results: int) -> list[dict]:
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


def save_gutenberg_text(text: str, title: str, ebook_id: int, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    safe_title = re.sub(r"[^\w\s-]", "", title).strip()[:80]
    filename = f"{safe_title}_gutenberg_{ebook_id}.txt"
    path = output_dir / filename
    path.write_text(text, encoding="utf-8")
    return path


def try_gutenberg(title: Optional[str], query: Optional[str], lang: str, output_dir: Path, limit: int) -> Optional[Path]:
    search = query or title
    if not search:
        return None
    results = gutenberg_search(search, lang, limit)
    if not results:
        return None
    book = select_best_match(results, title)
    if not book:
        return None

    text_url = choose_text_url(book.get("formats", {}))
    if not text_url:
        return None

    print(f"Trying Gutenberg: {book.get('title')} (ID {book.get('id')})")
    text = download_text(text_url)
    if not text:
        return None

    return save_gutenberg_text(text, book.get("title", "gutenberg_text"), book.get("id"), output_dir)


def main():
    parser = argparse.ArgumentParser(description="Fetch clean public-domain text by priority")
    parser.add_argument("--title", help="Preferred title")
    parser.add_argument("--query", help="Search query")
    parser.add_argument("--lang", default="en", help="Language code (default: en)")
    parser.add_argument("--output", default="./priority_output", help="Output directory")
    parser.add_argument("--wikisource-limit", type=int, default=10, help="Max Wikisource search results")
    parser.add_argument("--gutenberg-limit", type=int, default=20, help="Max Gutenberg search results")
    parser.add_argument("--order", default="wikisource,gutenberg", help="Priority order")

    args = parser.parse_args()
    output_dir = Path(args.output)
    order = [o.strip().lower() for o in args.order.split(",") if o.strip()]

    if not args.title and not args.query:
        parser.print_help()
        return

    for source in order:
        if source == "wikisource":
            path = try_wikisource(args.title, args.query, args.lang, output_dir, args.wikisource_limit)
            if path:
                print(f"✓ Fetched from Wikisource: {path}")
                return
        elif source == "gutenberg":
            path = try_gutenberg(args.title, args.query, args.lang, output_dir, args.gutenberg_limit)
            if path:
                print(f"✓ Fetched from Gutenberg: {path}")
                return
        elif source == "hathitrust":
            print("HathiTrust auto-download is blocked; use scripts/hathitrust_corpus.py for metadata.")
        elif source == "internetarchive":
            print("Internet Archive not wired in here; use scripts/ia_historical_corpus.py.")
        else:
            print(f"Unknown source in order list: {source}")

    print("No source yielded a text.")


if __name__ == "__main__":
    main()
