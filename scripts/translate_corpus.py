#!/usr/bin/env python3
"""
GEMI Corpus Translator

Translates non-English corpus texts to English using Claude Haiku.
Translations are saved alongside originals and uploaded to Supabase Storage.

Usage:
    pip install anthropic supabase
    export ANTHROPIC_API_KEY=your_key
    python scripts/translate_corpus.py
    python scripts/translate_corpus.py --identifier bub_gb_s6lSHDngPFoC  # Translate specific doc
    python scripts/translate_corpus.py --language lat  # Translate all Latin texts
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import Optional

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    print("Warning: anthropic not installed. Run: pip install anthropic")

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

CORPUS_DIR = Path("corpus")
METADATA_FILE = CORPUS_DIR / "metadata.json"
TRANSLATIONS_DIR = CORPUS_DIR / "translations"

# Languages that need translation (ISO 639-3 codes from Internet Archive)
TRANSLATABLE_LANGUAGES = {
    'lat': 'Latin',
    'fre': 'French',
    'ger': 'German',
    'rus': 'Russian',
    'spa': 'Spanish',
    'ita': 'Italian',
    'dut': 'Dutch',
    'por': 'Portuguese',
    # Also handle 2-letter codes
    'fr': 'French',
    'de': 'German',
    'ru': 'Russian',
    'es': 'Spanish',
    'it': 'Italian',
}

# Claude model for translation (Haiku is fast and cheap)
MODEL = "claude-3-5-haiku-20241022"

# Maximum characters per translation chunk (to stay within context limits)
MAX_CHUNK_SIZE = 80000  # ~20k tokens input

# Supabase config
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
STORAGE_BUCKET = "corpus-texts"


# ══════════════════════════════════════════════════════════════════════════════
# TRANSLATION FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def load_metadata() -> list[dict]:
    """Load corpus metadata."""
    if not METADATA_FILE.exists():
        raise FileNotFoundError(f"Metadata file not found: {METADATA_FILE}")
    with open(METADATA_FILE) as f:
        return json.load(f)


def save_metadata(metadata: list[dict]):
    """Save updated metadata."""
    with open(METADATA_FILE, 'w') as f:
        json.dump(metadata, f, indent=2)


def get_source_language(doc: dict) -> Optional[str]:
    """Determine the source language of a document."""
    # Check the 'language' field (usually ISO 639-3 from IA)
    lang = doc.get('language', '')
    if isinstance(lang, list):
        lang = lang[0] if lang else ''

    # If it's English, no translation needed
    if lang.lower() in ['eng', 'english', 'en', 'middle english']:
        return None

    # Check if it's a language we can translate
    if lang.lower() in TRANSLATABLE_LANGUAGES:
        return lang.lower()

    return None


def translate_text(text: str, source_language: str, title: str, year: int) -> str:
    """Translate text using Claude Haiku."""
    client = anthropic.Anthropic()

    lang_name = TRANSLATABLE_LANGUAGES.get(source_language, source_language)

    # For very long texts, we need to chunk
    if len(text) > MAX_CHUNK_SIZE:
        return translate_long_text(text, source_language, title, year)

    prompt = f"""Translate the following historical {lang_name} text from {year} into clear, readable modern English.
This is from a document titled "{title}".

Preserve the meaning and scholarly nature of the text. For technical or archaic terms, you may include the original term in [brackets] after the translation if helpful for scholars.

Do not add any commentary or notes - just provide the translation.

TEXT TO TRANSLATE:
{text}

ENGLISH TRANSLATION:"""

    message = client.messages.create(
        model=MODEL,
        max_tokens=8192,
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    return message.content[0].text


def translate_long_text(text: str, source_language: str, title: str, year: int) -> str:
    """Translate a long text by chunking it."""
    client = anthropic.Anthropic()
    lang_name = TRANSLATABLE_LANGUAGES.get(source_language, source_language)

    # Split into chunks at paragraph boundaries
    paragraphs = text.split('\n\n')
    chunks = []
    current_chunk = []
    current_size = 0

    for para in paragraphs:
        if current_size + len(para) > MAX_CHUNK_SIZE and current_chunk:
            chunks.append('\n\n'.join(current_chunk))
            current_chunk = [para]
            current_size = len(para)
        else:
            current_chunk.append(para)
            current_size += len(para)

    if current_chunk:
        chunks.append('\n\n'.join(current_chunk))

    print(f"    Translating in {len(chunks)} chunks...")

    translations = []
    for i, chunk in enumerate(chunks):
        print(f"    Chunk {i+1}/{len(chunks)}...")

        prompt = f"""Translate the following historical {lang_name} text from {year} into clear, readable modern English.
This is part {i+1} of {len(chunks)} from a document titled "{title}".

Preserve the meaning and scholarly nature of the text. For technical or archaic terms, you may include the original term in [brackets] after the translation if helpful.

Do not add any commentary - just provide the translation.

TEXT TO TRANSLATE:
{chunk}

ENGLISH TRANSLATION:"""

        message = client.messages.create(
            model=MODEL,
            max_tokens=8192,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        translations.append(message.content[0].text)

    return '\n\n'.join(translations)


def translate_document(doc: dict, force: bool = False) -> Optional[str]:
    """Translate a single document if needed."""
    identifier = doc['identifier']

    # Check if already translated
    if doc.get('has_translation') and not force:
        print(f"  Skipping {identifier} - already translated")
        return None

    # Check source language
    source_lang = get_source_language(doc)
    if not source_lang:
        print(f"  Skipping {identifier} - English or unknown language")
        return None

    # Load original text
    local_path = doc.get('local_path')
    if not local_path:
        print(f"  Skipping {identifier} - no local file")
        return None

    source_path = Path(local_path)
    if not source_path.exists():
        source_path = CORPUS_DIR / "raw_texts" / Path(local_path).name
        if not source_path.exists():
            print(f"  Skipping {identifier} - file not found")
            return None

    text = source_path.read_text(encoding='utf-8', errors='ignore')

    lang_name = TRANSLATABLE_LANGUAGES.get(source_lang, source_lang)
    print(f"  Translating {identifier} from {lang_name}...")
    print(f"    Original length: {len(text):,} characters")

    # Translate
    translation = translate_text(text, source_lang, doc['title'], doc['year'])

    print(f"    Translation length: {len(translation):,} characters")

    # Save translation locally
    TRANSLATIONS_DIR.mkdir(exist_ok=True)
    trans_filename = f"{Path(local_path).stem}_en.txt"
    trans_path = TRANSLATIONS_DIR / trans_filename
    trans_path.write_text(translation, encoding='utf-8')

    print(f"    Saved to {trans_path}")

    return trans_filename


def upload_translation_to_supabase(filename: str):
    """Upload a translation file to Supabase Storage."""
    if not SUPABASE_AVAILABLE or not SUPABASE_URL or not SUPABASE_KEY:
        print(f"    Skipping Supabase upload - not configured")
        return

    trans_path = TRANSLATIONS_DIR / filename
    if not trans_path.exists():
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    with open(trans_path, 'rb') as f:
        content = f.read()

    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            filename,
            content,
            {"content-type": "text/plain; charset=utf-8", "upsert": "true"}
        )
        print(f"    Uploaded {filename} to Supabase")
    except Exception as e:
        print(f"    Error uploading: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Translate corpus texts using Claude")
    parser.add_argument("--identifier", help="Translate a specific document by identifier")
    parser.add_argument("--language", help="Translate all documents in a specific language (e.g., lat, fre)")
    parser.add_argument("--all", action="store_true", help="Translate all non-English documents")
    parser.add_argument("--force", action="store_true", help="Re-translate even if already done")
    parser.add_argument("--upload", action="store_true", help="Upload translations to Supabase")
    parser.add_argument("--list", action="store_true", help="List documents needing translation")
    args = parser.parse_args()

    if not ANTHROPIC_AVAILABLE:
        print("Error: anthropic package not installed")
        print("Run: pip install anthropic")
        sys.exit(1)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set")
        sys.exit(1)

    print("="*60)
    print("GEMI Corpus Translator")
    print("="*60 + "\n")

    metadata = load_metadata()
    print(f"Loaded {len(metadata)} documents\n")

    # List mode
    if args.list:
        print("Documents needing translation:\n")
        for doc in metadata:
            lang = get_source_language(doc)
            if lang:
                has_trans = "✓" if doc.get('has_translation') else "✗"
                lang_name = TRANSLATABLE_LANGUAGES.get(lang, lang)
                print(f"  [{has_trans}] {doc['identifier'][:50]}")
                print(f"      {lang_name} ({doc['year']}) - {doc['title'][:60]}")
        return

    # Determine which documents to translate
    to_translate = []

    if args.identifier:
        doc = next((d for d in metadata if d['identifier'] == args.identifier), None)
        if doc:
            to_translate = [doc]
        else:
            print(f"Document not found: {args.identifier}")
            sys.exit(1)
    elif args.language:
        to_translate = [d for d in metadata if get_source_language(d) == args.language.lower()]
    elif args.all:
        to_translate = [d for d in metadata if get_source_language(d)]
    else:
        print("Specify --identifier, --language, --all, or --list")
        print("Example: python scripts/translate_corpus.py --identifier bub_gb_s6lSHDngPFoC")
        return

    print(f"Found {len(to_translate)} documents to translate\n")

    # Translate each document
    translated = 0
    for doc in to_translate:
        trans_filename = translate_document(doc, force=args.force)

        if trans_filename:
            # Update metadata
            doc['has_translation'] = True
            doc['translation_filename'] = trans_filename
            translated += 1

            # Upload to Supabase if requested
            if args.upload:
                upload_translation_to_supabase(trans_filename)

    # Save updated metadata
    if translated > 0:
        save_metadata(metadata)
        print(f"\n✓ Translated {translated} documents")
        print("  Metadata updated with translation info")

        if not args.upload:
            print("\n  Run with --upload to upload translations to Supabase")
            print("  Or run: python scripts/export_for_web.py --upload-supabase")


if __name__ == "__main__":
    main()
