#!/usr/bin/env python3
"""
Internet Archive Historical Corpus Builder

Downloads OCR'd text from Internet Archive for historical research
on topics like automation, thinking machines, computing, etc.

Usage:
    pip install internetarchive requests
    python ia_historical_corpus.py

Output structure:
    corpus/
    ├── metadata.json          # Index of all downloaded items
    ├── by_decade/
    │   ├── 1850s/
    │   ├── 1860s/
    │   └── ...
    └── by_topic/
        ├── calculating_machines/
        ├── automation/
        └── ...
"""

import os
import json
import time
import re
from pathlib import Path
from datetime import datetime
from typing import Optional
import internetarchive as ia
import requests

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

# Search terms grouped by topic
SEARCH_TOPICS = {
    "calculating_machines": [
        "calculating machine",
        "difference engine",
        "analytical engine",
        "babbage",
        "arithmetic machine",
    ],
    "automata": [
        "automaton",
        "automata",
        "mechanical man",
        "mechanical chess",
        "android machine",
    ],
    "thinking_machines": [
        "thinking machine",
        "mechanical brain",
        "machine intelligence",
        "artificial mind",
        "machine thought",
    ],
    "computing": [
        "computing machine",
        "electronic brain",
        "digital computer",
        "turing machine",
        "stored program",
    ],
    "cybernetics": [
        "cybernetics",
        "feedback control",
        "servomechanism",
        "norbert wiener",
    ],
    "automation": [
        "automation",
        "automatic control",
        "automatic factory",
        "robot",
        "robotics",
    ],
}

# Date range (public domain safe)
START_YEAR = 1850
END_YEAR = 1950

# Output directory
CORPUS_DIR = Path("corpus")

# Rate limiting (be nice to IA servers)
REQUEST_DELAY = 1.0  # seconds between requests

# Maximum items per search term (to avoid overwhelming)
MAX_ITEMS_PER_TERM = 50


# ══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def setup_directories():
    """Create the corpus directory structure."""
    CORPUS_DIR.mkdir(exist_ok=True)
    (CORPUS_DIR / "by_decade").mkdir(exist_ok=True)
    (CORPUS_DIR / "by_topic").mkdir(exist_ok=True)
    (CORPUS_DIR / "raw_texts").mkdir(exist_ok=True)

    # Create decade folders
    for decade in range(START_YEAR // 10 * 10, END_YEAR + 10, 10):
        (CORPUS_DIR / "by_decade" / f"{decade}s").mkdir(exist_ok=True)

    # Create topic folders
    for topic in SEARCH_TOPICS.keys():
        (CORPUS_DIR / "by_topic" / topic).mkdir(exist_ok=True)


def extract_year(date_str: Optional[str]) -> Optional[int]:
    """Extract year from various date formats."""
    if not date_str:
        return None

    # Try common patterns
    patterns = [
        r'(\d{4})',  # Just a year
        r'(\d{4})-\d{2}-\d{2}',  # ISO format
    ]

    for pattern in patterns:
        match = re.search(pattern, str(date_str))
        if match:
            year = int(match.group(1))
            if START_YEAR <= year <= END_YEAR:
                return year
    return None


def get_decade(year: int) -> str:
    """Get decade string from year."""
    return f"{(year // 10) * 10}s"


def get_ocr_text_url(identifier: str) -> Optional[str]:
    """Get the URL for OCR'd text file if available."""
    try:
        item = ia.get_item(identifier)
        files = list(item.get_files())

        # Prefer DjVu text, then plain text
        for f in files:
            if f.name.endswith('_djvu.txt'):
                return f"https://archive.org/download/{identifier}/{f.name}"

        for f in files:
            if f.name.endswith('.txt') and 'ocr' in f.name.lower():
                return f"https://archive.org/download/{identifier}/{f.name}"

        return None
    except Exception as e:
        print(f"  Error getting files for {identifier}: {e}")
        return None


def download_text(url: str, identifier: str) -> Optional[str]:
    """Download text content from URL."""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        return response.text
    except Exception as e:
        print(f"  Error downloading {identifier}: {e}")
        return None


def clean_text(text: str) -> str:
    """Basic text cleaning."""
    # Remove excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    # Remove common OCR artifacts
    text = re.sub(r'[^\x00-\x7F]+', ' ', text)  # Non-ASCII
    return text.strip()


def save_text(text: str, identifier: str, year: int, topic: str, metadata: dict):
    """Save text to appropriate locations."""
    # Clean filename
    safe_id = re.sub(r'[^\w\-]', '_', identifier)
    filename = f"{year}_{safe_id}.txt"

    # Save to raw_texts
    raw_path = CORPUS_DIR / "raw_texts" / filename
    raw_path.write_text(text, encoding='utf-8')

    # Create symlinks for organization
    decade = get_decade(year)
    decade_link = CORPUS_DIR / "by_decade" / decade / filename
    topic_link = CORPUS_DIR / "by_topic" / topic / filename

    # Use relative symlinks
    try:
        if not decade_link.exists():
            decade_link.symlink_to(f"../../raw_texts/{filename}")
        if not topic_link.exists():
            topic_link.symlink_to(f"../../raw_texts/{filename}")
    except OSError:
        # Windows doesn't always support symlinks, just copy
        if not decade_link.exists():
            decade_link.write_text(text, encoding='utf-8')
        if not topic_link.exists():
            topic_link.write_text(text, encoding='utf-8')

    return str(raw_path)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN SEARCH AND DOWNLOAD
# ══════════════════════════════════════════════════════════════════════════════

def search_and_download():
    """Main function to search IA and download texts."""
    setup_directories()

    # Track what we've downloaded (avoid duplicates)
    downloaded = set()
    metadata_index = []

    # Load existing metadata if resuming
    metadata_file = CORPUS_DIR / "metadata.json"
    if metadata_file.exists():
        with open(metadata_file) as f:
            metadata_index = json.load(f)
            downloaded = {item['identifier'] for item in metadata_index}
        print(f"Resuming: {len(downloaded)} items already downloaded")

    total_downloaded = len(downloaded)

    for topic, search_terms in SEARCH_TOPICS.items():
        print(f"\n{'='*60}")
        print(f"Topic: {topic}")
        print('='*60)

        for term in search_terms:
            print(f"\n  Searching: '{term}'")

            # Build search query
            query = f'"{term}" AND date:[{START_YEAR}-01-01 TO {END_YEAR}-12-31] AND mediatype:(texts)'

            try:
                search_results = ia.search_items(
                    query,
                    fields=['identifier', 'title', 'date', 'creator', 'description', 'subject'],
                    sorts=['date asc']
                )

                count = 0
                for result in search_results:
                    if count >= MAX_ITEMS_PER_TERM:
                        print(f"    Reached limit of {MAX_ITEMS_PER_TERM} items for this term")
                        break

                    identifier = result.get('identifier')

                    # Skip if already downloaded
                    if identifier in downloaded:
                        continue

                    title = result.get('title', 'Unknown')
                    date = result.get('date')
                    year = extract_year(date)

                    if not year:
                        continue

                    print(f"    [{year}] {title[:50]}...")

                    # Get OCR text URL
                    text_url = get_ocr_text_url(identifier)
                    if not text_url:
                        print(f"      No OCR text available, skipping")
                        continue

                    # Download text
                    text = download_text(text_url, identifier)
                    if not text or len(text) < 500:
                        print(f"      Text too short or empty, skipping")
                        continue

                    # Clean and save
                    text = clean_text(text)

                    item_metadata = {
                        'identifier': identifier,
                        'title': title,
                        'year': year,
                        'date': date,
                        'creator': result.get('creator'),
                        'description': result.get('description', '')[:500] if result.get('description') else None,
                        'subject': result.get('subject'),
                        'topic': topic,
                        'search_term': term,
                        'source_url': f"https://archive.org/details/{identifier}",
                        'text_url': text_url,
                        'char_count': len(text),
                        'downloaded_at': datetime.now().isoformat(),
                    }

                    filepath = save_text(text, identifier, year, topic, item_metadata)
                    item_metadata['local_path'] = filepath

                    metadata_index.append(item_metadata)
                    downloaded.add(identifier)
                    total_downloaded += 1
                    count += 1

                    print(f"      ✓ Saved ({len(text):,} chars)")

                    # Save metadata periodically
                    if total_downloaded % 10 == 0:
                        with open(metadata_file, 'w') as f:
                            json.dump(metadata_index, f, indent=2)

                    # Rate limiting
                    time.sleep(REQUEST_DELAY)

            except Exception as e:
                print(f"    Error searching for '{term}': {e}")
                continue

    # Final save
    with open(metadata_file, 'w') as f:
        json.dump(metadata_index, f, indent=2)

    print(f"\n{'='*60}")
    print(f"COMPLETE: Downloaded {total_downloaded} items")
    print(f"Corpus saved to: {CORPUS_DIR.absolute()}")
    print(f"Metadata index: {metadata_file}")
    print('='*60)

    # Print summary by decade
    print("\nItems by decade:")
    decade_counts = {}
    for item in metadata_index:
        decade = get_decade(item['year'])
        decade_counts[decade] = decade_counts.get(decade, 0) + 1
    for decade in sorted(decade_counts.keys()):
        print(f"  {decade}: {decade_counts[decade]}")

    # Print summary by topic
    print("\nItems by topic:")
    topic_counts = {}
    for item in metadata_index:
        topic = item['topic']
        topic_counts[topic] = topic_counts.get(topic, 0) + 1
    for topic, count in sorted(topic_counts.items(), key=lambda x: -x[1]):
        print(f"  {topic}: {count}")


if __name__ == "__main__":
    print("Internet Archive Historical Corpus Builder")
    print(f"Searching for texts from {START_YEAR}-{END_YEAR}")
    print(f"Topics: {', '.join(SEARCH_TOPICS.keys())}")
    print()

    search_and_download()
