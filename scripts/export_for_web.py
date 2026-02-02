#!/usr/bin/env python3
"""
Export corpus data for the Next.js web interface.

This script:
1. Reads corpus/metadata.json
2. Exports public/data/corpus-index.json (metadata for static generation)
3. Copies texts to public/texts/ (for Pagefind indexing)
4. Optionally uploads texts to Supabase Storage

Usage:
    python scripts/export_for_web.py
    python scripts/export_for_web.py --upload-supabase
"""

import os
import sys
import json
import shutil
import argparse
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

CORPUS_DIR = Path("corpus")
METADATA_FILE = CORPUS_DIR / "metadata.json"
RAW_TEXTS_DIR = CORPUS_DIR / "raw_texts"
TRANSLATIONS_DIR = CORPUS_DIR / "translations"

PUBLIC_DIR = Path("public")
DATA_OUTPUT_DIR = PUBLIC_DIR / "data"
TEXTS_OUTPUT_DIR = PUBLIC_DIR / "texts"
TRANSLATIONS_OUTPUT_DIR = PUBLIC_DIR / "translations"
RAW_TEXTS_OUTPUT_DIR = PUBLIC_DIR / "raw_texts"

CORPUS_INDEX_FILE = DATA_OUTPUT_DIR / "corpus-index.json"

# Supabase configuration (from environment variables)
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")  # Use service key for uploads
STORAGE_BUCKET = "corpus-texts"


# ══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def setup_directories():
    """Create output directories if they don't exist."""
    DATA_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEXTS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TRANSLATIONS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RAW_TEXTS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"✓ Created output directories")


def load_metadata() -> list[dict]:
    """Load corpus metadata from JSON file."""
    if not METADATA_FILE.exists():
        print(f"Error: Metadata file not found: {METADATA_FILE}")
        print("Run the corpus builder first: python ia_historical_corpus.py")
        sys.exit(1)

    with open(METADATA_FILE) as f:
        metadata = json.load(f)

    print(f"✓ Loaded {len(metadata)} documents from metadata")
    return metadata


def export_corpus_index(metadata: list[dict]):
    """Export metadata as JSON for the web frontend."""
    # Clean up metadata for web export
    web_metadata = []
    for doc in metadata:
        web_doc = {
            "identifier": doc["identifier"],
            "title": doc["title"],
            "year": doc["year"],
            "publication_year": doc.get("publication_year"),
            "gutenberg_release_year": doc.get("gutenberg_release_year"),
            "year_source": doc.get("year_source"),
            "creator": doc.get("creator"),
            "description": doc.get("description", "")[:300] if doc.get("description") else None,
            "topic": doc["topic"],
            "language_code": doc.get("language_code", "en"),
            "language": doc.get("language"),
            "source_url": doc["source_url"],
            "char_count": doc.get("char_count", 0),
            "source": doc.get("source"),
            # Generate filename for storage/local reference
            "filename": Path(doc.get("local_path", "")).name if doc.get("local_path") else None,
            # Translation support
            "has_translation": doc.get("has_translation", False),
            "translation_filename": doc.get("translation_filename"),
        }
        web_metadata.append(web_doc)

    # Sort by year
    web_metadata.sort(key=lambda x: x["year"])

    with open(CORPUS_INDEX_FILE, "w") as f:
        json.dump(web_metadata, f, indent=2)

    print(f"✓ Exported corpus index to {CORPUS_INDEX_FILE}")
    print(f"  Size: {CORPUS_INDEX_FILE.stat().st_size / 1024:.1f} KB")


def copy_texts_for_pagefind(metadata: list[dict]):
    """
    Copy text files to public/texts/ for Pagefind indexing.

    Creates HTML wrapper files that Pagefind can index, with metadata
    embedded for filtering.
    """
    copied = 0
    raw_copied = 0
    skipped = 0

    for doc in metadata:
        local_path = doc.get("local_path")
        if not local_path:
            skipped += 1
            continue

        source_path = Path(local_path)
        if not source_path.exists():
            # Try relative to corpus directory
            source_path = CORPUS_DIR / "raw_texts" / Path(local_path).name
            if not source_path.exists():
                skipped += 1
                continue

        # Read the text content
        try:
            text_content = source_path.read_text(encoding='utf-8', errors='ignore')
        except Exception as e:
            print(f"  Warning: Could not read {source_path}: {e}")
            skipped += 1
            continue

        # Copy raw text for in-app viewing
        raw_filename = Path(doc.get("local_path", "")).name
        if raw_filename:
            raw_out = RAW_TEXTS_OUTPUT_DIR / raw_filename
            raw_out.write_text(text_content, encoding='utf-8')
            raw_copied += 1

        # Create an HTML file that Pagefind can index
        # Include metadata as data attributes for filtering
        html_filename = f"{doc['identifier']}.html"
        html_path = TEXTS_OUTPUT_DIR / html_filename

        html_content = f"""<!DOCTYPE html>
<html lang="{doc.get('language_code', 'en')}">
<head>
    <meta charset="UTF-8">
    <title>{doc['title']}</title>
</head>
<body>
    <article
        data-pagefind-body
        data-pagefind-meta="title:{doc['title']}"
        data-pagefind-filter="year:{doc['year']}"
        data-pagefind-filter="decade:{(doc['year'] // 10) * 10}s"
        data-pagefind-filter="topic:{doc['topic']}"
        data-pagefind-filter="language:{doc.get('language_code', 'en')}"
        data-pagefind-sort="year:{doc['year']}"
    >
        <h1>{doc['title']}</h1>
        <div class="metadata">
            <span class="year">{doc['year']}</span>
            <span class="creator">{doc.get('creator', 'Unknown')}</span>
            <span class="topic">{doc['topic']}</span>
            <span class="language">{doc.get('language_code', 'en')}</span>
        </div>
        <div class="content">
            <pre>{text_content}</pre>
        </div>
    </article>
</body>
</html>
"""
        html_path.write_text(html_content, encoding='utf-8')
        copied += 1

    print(f"✓ Created {copied} HTML files for Pagefind indexing")
    print(f"✓ Copied {raw_copied} raw text files for viewer")
    if skipped:
        print(f"  Skipped {skipped} documents (missing source files)")


def copy_translations(metadata: list[dict]):
    """
    Copy translation files to public/translations/ for web access.
    """
    copied = 0

    for doc in metadata:
        if not doc.get("has_translation"):
            continue

        trans_filename = doc.get("translation_filename")
        if not trans_filename:
            continue

        source_path = TRANSLATIONS_DIR / trans_filename
        if not source_path.exists():
            print(f"  Warning: Translation file not found: {source_path}")
            continue

        # Copy the translation file
        dest_path = TRANSLATIONS_OUTPUT_DIR / trans_filename
        shutil.copy2(source_path, dest_path)
        copied += 1

    print(f"✓ Copied {copied} translation files to {TRANSLATIONS_OUTPUT_DIR}")


def upload_to_supabase(metadata: list[dict]):
    """Upload text files to Supabase Storage."""
    try:
        from supabase import create_client, Client
    except ImportError:
        print("Error: supabase-py not installed. Run: pip install supabase")
        sys.exit(1)

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Supabase credentials not found in environment variables.")
        print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY")
        sys.exit(1)

    print(f"Connecting to Supabase: {SUPABASE_URL}")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Check if bucket exists, create if not
    try:
        buckets = supabase.storage.list_buckets()
        bucket_names = [b.name for b in buckets]
        if STORAGE_BUCKET not in bucket_names:
            print(f"Creating storage bucket: {STORAGE_BUCKET}")
            supabase.storage.create_bucket(STORAGE_BUCKET, {"public": True})
    except Exception as e:
        print(f"Warning: Could not check/create bucket: {e}")

    uploaded = 0
    skipped = 0
    errors = 0

    for doc in metadata:
        local_path = doc.get("local_path")
        if not local_path:
            skipped += 1
            continue

        source_path = Path(local_path)
        if not source_path.exists():
            source_path = CORPUS_DIR / "raw_texts" / Path(local_path).name
            if not source_path.exists():
                skipped += 1
                continue

        filename = source_path.name

        try:
            with open(source_path, "rb") as f:
                file_content = f.read()

            # Upload to Supabase Storage
            response = supabase.storage.from_(STORAGE_BUCKET).upload(
                filename,
                file_content,
                {"content-type": "text/plain; charset=utf-8", "upsert": "true"}
            )

            uploaded += 1
            if uploaded % 10 == 0:
                print(f"  Uploaded {uploaded} files...")

        except Exception as e:
            print(f"  Error uploading {filename}: {e}")
            errors += 1

    print(f"✓ Uploaded {uploaded} files to Supabase Storage")
    if skipped:
        print(f"  Skipped {skipped} documents (missing source files)")
    if errors:
        print(f"  Errors: {errors}")

    # Also upload translations
    trans_uploaded = 0
    for doc in metadata:
        if not doc.get("has_translation"):
            continue
        trans_filename = doc.get("translation_filename")
        if not trans_filename:
            continue
        trans_path = TRANSLATIONS_DIR / trans_filename
        if not trans_path.exists():
            continue

        try:
            with open(trans_path, "rb") as f:
                file_content = f.read()
            response = supabase.storage.from_(STORAGE_BUCKET).upload(
                trans_filename,
                file_content,
                {"content-type": "text/plain; charset=utf-8", "upsert": "true"}
            )
            trans_uploaded += 1
        except Exception as e:
            print(f"  Error uploading translation {trans_filename}: {e}")

    print(f"✓ Uploaded {trans_uploaded} translation files to Supabase Storage")


def print_summary(metadata: list[dict]):
    """Print a summary of the export."""
    print("\n" + "="*60)
    print("EXPORT SUMMARY")
    print("="*60)

    # Count by decade
    by_decade = {}
    for doc in metadata:
        decade = (doc['year'] // 10) * 10
        by_decade[decade] = by_decade.get(decade, 0) + 1

    print(f"\nTotal documents: {len(metadata)}")
    print(f"\nBy decade:")
    for decade in sorted(by_decade.keys()):
        print(f"  {decade}s: {by_decade[decade]}")

    # Count by language
    by_lang = {}
    for doc in metadata:
        lang = doc.get('language_code', 'unknown')
        by_lang[lang] = by_lang.get(lang, 0) + 1

    print(f"\nBy language:")
    for lang, count in sorted(by_lang.items(), key=lambda x: -x[1]):
        print(f"  {lang}: {count}")

    # Count by topic
    by_topic = {}
    for doc in metadata:
        topic = doc['topic']
        by_topic[topic] = by_topic.get(topic, 0) + 1

    print(f"\nBy topic:")
    for topic, count in sorted(by_topic.items(), key=lambda x: -x[1]):
        print(f"  {topic}: {count}")

    print("\n" + "="*60)
    print("Next steps:")
    print("  1. Run 'npm run dev' to start the development server")
    print("  2. Run 'npm run build:full' to build with Pagefind search")
    print("="*60)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Export corpus data for the web interface"
    )
    parser.add_argument(
        "--upload-supabase",
        action="store_true",
        help="Upload text files to Supabase Storage"
    )
    parser.add_argument(
        "--skip-texts",
        action="store_true",
        help="Skip copying texts for Pagefind (faster for testing)"
    )
    args = parser.parse_args()

    print("="*60)
    print("GEMI Corpus Web Export")
    print("="*60 + "\n")

    # Setup
    setup_directories()

    # Load metadata
    metadata = load_metadata()

    # Export corpus index
    export_corpus_index(metadata)

    # Copy texts for Pagefind
    if not args.skip_texts:
        copy_texts_for_pagefind(metadata)

    # Copy translations
    copy_translations(metadata)

    # Upload to Supabase if requested
    if args.upload_supabase:
        upload_to_supabase(metadata)

    # Print summary
    print_summary(metadata)


if __name__ == "__main__":
    main()
