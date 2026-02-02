#!/usr/bin/env python3
"""
Project Gutenberg Historical Corpus Builder

Downloads plain text from Project Gutenberg via Gutendex and ingests
into the GEMI corpus format.

Usage:
    python scripts/gutenberg_historical_corpus.py -t thinking_machines -l en --max-items 10
"""

import argparse
import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

GUTENDEX_URL = "https://gutendex.com/books"
GUTENBERG_RDF_URL = "https://www.gutenberg.org/ebooks/{ebook_id}.rdf"
GUTENBERG_EBOOK_URL = "https://www.gutenberg.org/ebooks/{ebook_id}"

CORPUS_DIR = Path("corpus")
METADATA_FILE = CORPUS_DIR / "metadata.json"

REQUEST_DELAY = 1.0

# Minimal topic map for Gutenberg search
SEARCH_TOPICS = {
    "thinking_machines": [
        "thinking machine",
        "mechanical brain",
        "logic machine",
        "reasoning machine",
        "artificial mind",
        "automaton",
        "automata",
        "mechanical man",
        "robot",
        "android",
    ],
    "automata": [
        "automaton",
        "automata",
        "mechanical man",
        "android",
        "self-moving machine",
    ],
}

LANGUAGE_NAMES = {
    "en": "English",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "it": "Italian",
    "ru": "Russian",
    "la": "Latin",
}

# Keywords used to keep Gutenberg results relevant to a topic
TOPIC_KEYWORDS = {
    "thinking_machines": [
        "automaton",
        "automata",
        "robot",
        "android",
        "brain",
        "thinking machine",
        "logic machine",
        "mechanical brain",
        "mechanical man",
        "chess player",
    ],
    "automata": [
        "automaton",
        "automata",
        "android",
        "robot",
        "mechanical",
        "self-moving",
    ],
}


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def setup_directories():
    CORPUS_DIR.mkdir(exist_ok=True)
    (CORPUS_DIR / "by_decade").mkdir(exist_ok=True)
    (CORPUS_DIR / "by_topic").mkdir(exist_ok=True)
    (CORPUS_DIR / "by_language").mkdir(exist_ok=True)
    (CORPUS_DIR / "raw_texts").mkdir(exist_ok=True)


def get_decade(year: int) -> str:
    return f"{(year // 10) * 10}s"


def load_metadata() -> list[dict]:
    if METADATA_FILE.exists():
        with open(METADATA_FILE) as f:
            return json.load(f)
    return []


def save_metadata(metadata: list[dict]) -> None:
    with open(METADATA_FILE, "w") as f:
        json.dump(metadata, f, indent=2)


def choose_text_url(formats: dict) -> Optional[str]:
    if not formats:
        return None
    # Prefer UTF-8 plain text
    for key, url in formats.items():
        if key.startswith("text/plain; charset=utf-8"):
            return url
    # Fallback: any plain text
    for key, url in formats.items():
        if key.startswith("text/plain"):
            return url
    return None


def download_text(url: str) -> Optional[str]:
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        print(f"  Error downloading text: {e}")
        return None


def extract_publication_year_from_text(text: str) -> Optional[int]:
    """
    Heuristic extraction of publication year from Gutenberg plain text.
    Looks for year-like patterns near the start of the actual book content.
    """
    if not text:
        return None

    # Skip Gutenberg header if present
    start_markers = [
        "*** START OF THE PROJECT GUTENBERG EBOOK",
        "*** START OF THIS PROJECT GUTENBERG EBOOK",
    ]
    start_idx = 0
    for marker in start_markers:
        idx = text.find(marker)
        if idx != -1:
            start_idx = idx + len(marker)
            break

    window = text[start_idx:start_idx + 6000]
    lines = window.splitlines()

    keyword_lines = []
    for line in lines[:200]:
        lower = line.lower()
        if any(k in lower for k in ["published", "publication", "printed", "press", "copyright"]):
            keyword_lines.append(line)

    def find_year_in_lines(target_lines):
        for line in target_lines:
            match = re.search(r"\b(1[5-9]\d{2}|20\d{2})\b", line)
            if match:
                return int(match.group(1))
        return None

    year = find_year_in_lines(keyword_lines)
    if year:
        return year

    # Fallback: first year-like pattern in the window
    match = re.search(r"\b(1[5-9]\d{2}|20\d{2})\b", window)
    if match:
        return int(match.group(1))

    return None


def fetch_rdf_year(ebook_id: int) -> Optional[int]:
    """
    Attempt to read a year from Gutenberg RDF metadata.
    Note: This is usually the Gutenberg release year, not original publication year.
    """
    try:
        url = GUTENBERG_RDF_URL.format(ebook_id=ebook_id)
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        rdf = resp.text

        # Try issued or created dates (YYYY-MM-DD)
        for tag in ("dcterms:issued", "dcterms:created"):
            match = re.search(rf"<{tag}[^>]*>\s*(\d{{4}})-\d{{2}}-\d{{2}}\s*</{tag}>", rdf)
            if match:
                return int(match.group(1))

        # Fallback: any 4-digit year in RDF (conservative)
        match = re.search(r"(\d{4})-\d{2}-\d{2}", rdf)
        if match:
            return int(match.group(1))

        return None
    except Exception as e:
        print(f"  Error fetching RDF for {ebook_id}: {e}")
        return None


def fetch_original_publication_year(ebook_id: int) -> Optional[int]:
    """
    Try to read the original publication year from the Gutenberg ebook page.
    Returns a 4-digit year if found, otherwise None.
    """
    try:
        url = GUTENBERG_EBOOK_URL.format(ebook_id=ebook_id)
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        html = resp.text

        # Look for "Original Publication" field on Gutenberg pages
        match = re.search(r"Original Publication\s*</[^>]+>\s*([^<]+)", html, re.IGNORECASE)
        if match:
            text = match.group(1)
            year_match = re.search(r"(1[5-9]\d{2}|20\d{2})", text)
            if year_match:
                return int(year_match.group(1))

        return None
    except Exception as e:
        print(f"  Error fetching Gutenberg ebook page for {ebook_id}: {e}")
        return None


def fetch_books(query: str, language: Optional[str], max_items: int) -> list[dict]:
    results = []
    next_url = f"{GUTENDEX_URL}?search={requests.utils.quote(query)}"

    while next_url and len(results) < max_items:
        resp = requests.get(next_url, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        for item in data.get("results", []):
            if language and language not in item.get("languages", []):
                continue
            results.append(item)
            if len(results) >= max_items:
                break

        next_url = data.get("next")

    return results


def is_relevant(book: dict, topic: str) -> bool:
    keywords = TOPIC_KEYWORDS.get(topic)
    if not keywords:
        return True
    haystack = " ".join(
        [
            book.get("title", ""),
            " ".join(book.get("subjects", []) or []),
            " ".join(book.get("bookshelves", []) or []),
        ]
    ).lower()
    return any(k in haystack for k in keywords)


def save_text(text: str, identifier: str, year: int, topic: str, language: str) -> str:
    safe_id = re.sub(r"[^\w\-]", "_", identifier)
    filename = f"{year}_{language}_{safe_id}.txt"

    raw_path = CORPUS_DIR / "raw_texts" / filename
    raw_path.write_text(text, encoding="utf-8")

    decade = get_decade(year)
    decade_link = CORPUS_DIR / "by_decade" / decade / filename
    topic_link = CORPUS_DIR / "by_topic" / topic / filename
    lang_link = CORPUS_DIR / "by_language" / language / filename

    decade_link.parent.mkdir(parents=True, exist_ok=True)
    topic_link.parent.mkdir(parents=True, exist_ok=True)
    lang_link.parent.mkdir(parents=True, exist_ok=True)

    try:
        if not decade_link.exists():
            decade_link.symlink_to(f"../../raw_texts/{filename}")
        if not topic_link.exists():
            topic_link.symlink_to(f"../../raw_texts/{filename}")
        if not lang_link.exists():
            lang_link.symlink_to(f"../../raw_texts/{filename}")
    except OSError:
        if not decade_link.exists():
            decade_link.write_text(text, encoding="utf-8")
        if not topic_link.exists():
            topic_link.write_text(text, encoding="utf-8")
        if not lang_link.exists():
            lang_link.write_text(text, encoding="utf-8")

    return str(raw_path)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Download texts from Project Gutenberg via Gutendex")
    parser.add_argument("-t", "--topic", default="thinking_machines", help="Topic key")
    parser.add_argument("-l", "--language", default="en", help="Language code (default: en)")
    parser.add_argument("--query", default=None, help="Custom search query (overrides topic terms)")
    parser.add_argument("--max-items", type=int, default=10, help="Max items to download")
    parser.add_argument("--delay", type=float, default=REQUEST_DELAY, help="Delay between requests")

    args = parser.parse_args()

    setup_directories()
    metadata = load_metadata()
    existing_ids = {doc.get("identifier") for doc in metadata}

    if args.query:
        queries = [args.query]
    else:
        queries = SEARCH_TOPICS.get(args.topic)
        if not queries:
            print(f"Unknown topic: {args.topic}. Provide --query or add to SEARCH_TOPICS.")
            return

    added = 0

    for query in queries:
        if added >= args.max_items:
            break

        print(f"Searching Gutendex for: {query}")
        try:
            books = fetch_books(query, args.language, args.max_items - added)
        except Exception as e:
            print(f"  Error searching Gutendex: {e}")
            continue

        for book in books:
            if added >= args.max_items:
                break

            ebook_id = book.get("id")
            identifier = f"gutenberg_{ebook_id}"
            if identifier in existing_ids:
                continue

            if not is_relevant(book, args.topic):
                continue

            text_url = choose_text_url(book.get("formats", {}))
            if not text_url:
                continue

            release_year = fetch_rdf_year(ebook_id)
            print(f"  Downloading {identifier} ({book.get('title')})")
            text = download_text(text_url)
            if not text:
                continue

            original_year = fetch_original_publication_year(ebook_id)
            if not original_year:
                original_year = extract_publication_year_from_text(text)

            year = original_year or release_year
            year_source = "gutenberg_original_publication" if original_year else "gutenberg_release_year"

            if not year:
                # Skip if we can't get any year; prevents timeline distortion
                print(f"  Skipping {identifier} (no year found)")
                continue

            local_path = save_text(
                text=text,
                identifier=identifier,
                year=year,
                topic=args.topic,
                language=args.language,
            )

            doc = {
                "identifier": identifier,
                "title": book.get("title"),
                "year": year,
                "publication_year": original_year,
                "gutenberg_release_year": release_year,
                "year_source": year_source,
                "creator": ", ".join(a.get("name") for a in book.get("authors", []) if a.get("name")) or None,
                "description": None,
                "topic": args.topic,
                "language_code": args.language,
                "language": LANGUAGE_NAMES.get(args.language, args.language),
                "source_url": f"https://www.gutenberg.org/ebooks/{ebook_id}",
                "local_path": local_path,
                "char_count": len(text),
                "downloaded_at": datetime.utcnow().isoformat(),
                "source": "gutenberg",
                "ocr_source": "gutenberg_plain_text",
            }

            metadata.append(doc)
            existing_ids.add(identifier)
            added += 1

            time.sleep(args.delay)

    if added:
        save_metadata(metadata)
        print(f"✓ Added {added} Gutenberg documents")
    else:
        print("No new documents added")


if __name__ == "__main__":
    main()
