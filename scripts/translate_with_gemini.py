#!/usr/bin/env python3
"""
Translate non-English corpus texts using Google Gemini API.

Uses Gemini 2.0 Flash for fast, cheap translations of Latin, French, etc.

Usage:
    python scripts/translate_with_gemini.py                    # Translate all non-English
    python scripts/translate_with_gemini.py --identifier ID    # Translate specific document
    python scripts/translate_with_gemini.py --list             # List documents needing translation
"""

import os
import sys
import json
import argparse
import time
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

from google import genai

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

CORPUS_DIR = Path("corpus")
METADATA_FILE = CORPUS_DIR / "metadata.json"
RAW_TEXTS_DIR = CORPUS_DIR / "raw_texts"
TRANSLATIONS_DIR = CORPUS_DIR / "translations"

# Languages that need translation (ISO codes)
NON_ENGLISH_CODES = {'fr', 'la', 'de', 'it', 'es', 'ru'}

# Gemini configuration - using current recommended model (2025/2026)
MODEL_NAME = "gemini-2.5-flash-lite"
MAX_CHUNK_CHARS = 80000  # ~20k tokens, safe for context window

LANGUAGE_NAMES = {
    'la': 'Latin',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'es': 'Spanish',
    'ru': 'Russian',
}

# ══════════════════════════════════════════════════════════════════════════════
# TRANSLATION FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def setup_gemini():
    """Initialize Gemini API client."""
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not found in environment")
        print("Set it in .env.local or export GEMINI_API_KEY=...")
        sys.exit(1)

    # Modern google-genai SDK - client auto-configures from env
    return genai.Client(api_key=api_key)


def load_metadata() -> list[dict]:
    """Load corpus metadata."""
    if not METADATA_FILE.exists():
        print(f"Error: Metadata file not found: {METADATA_FILE}")
        sys.exit(1)

    with open(METADATA_FILE) as f:
        return json.load(f)


def save_metadata(metadata: list[dict]):
    """Save corpus metadata."""
    with open(METADATA_FILE, 'w') as f:
        json.dump(metadata, f, indent=2)


def get_documents_needing_translation(metadata: list[dict]) -> list[dict]:
    """Find documents that need translation."""
    docs = []
    for doc in metadata:
        lang_code = doc.get('language_code', 'en')
        if lang_code in NON_ENGLISH_CODES:
            if not doc.get('has_translation', False):
                docs.append(doc)
    return docs


def chunk_text(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """Split text into chunks, trying to break at paragraph boundaries."""
    if len(text) <= max_chars:
        return [text]

    chunks = []
    current_pos = 0

    while current_pos < len(text):
        end_pos = min(current_pos + max_chars, len(text))

        # If not at end, try to find a good break point
        if end_pos < len(text):
            # Look for paragraph break (double newline)
            break_pos = text.rfind('\n\n', current_pos, end_pos)
            if break_pos > current_pos + max_chars // 2:
                end_pos = break_pos + 2
            else:
                # Look for single newline
                break_pos = text.rfind('\n', current_pos, end_pos)
                if break_pos > current_pos + max_chars // 2:
                    end_pos = break_pos + 1

        chunks.append(text[current_pos:end_pos])
        current_pos = end_pos

    return chunks


def translate_chunk(client, text: str, source_lang: str, chunk_num: int, total_chunks: int) -> str:
    """Translate a single chunk of text."""

    lang_name = LANGUAGE_NAMES.get(source_lang, source_lang)

    prompt = f"""You are translating a {lang_name} text from a historical book that was OCR scanned. The scan may have errors and artifacts.

This is part {chunk_num} of {total_chunks} of the document.

YOUR TASK:
1. First, mentally reconstruct the original {lang_name} text by fixing obvious OCR errors (like 'f' for 's', broken words, garbage characters)
2. Then translate the reconstructed text to clear, readable English
3. Skip any lines that are purely OCR garbage (random letters/symbols that don't form words)

CRITICAL RULES:
- Provide a COMPLETE, FAITHFUL translation - do not summarize
- Skip garbage/noise but translate ALL actual content
- Preserve mathematical notation and proposition numbering (Prop. I, II, etc.)
- Keep technical terms in brackets [Latin term] where helpful
- Mark genuinely unclear passages with [?]
- Do NOT include the original {lang_name} - only output English

EXAMPLE OCR ERRORS TO FIX:
- "f" often means "s" (e.g., "funt" = "sunt", "eft" = "est")
- "[" often means "s" or is noise
- Random letters at page edges are noise
- "æ" may appear as "a" or "ae"

TEXT TO TRANSLATE (with OCR errors):

{text}

ENGLISH TRANSLATION (clean, readable):"""

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt
        )
        return response.text.strip()
    except Exception as e:
        print(f"  Error translating chunk {chunk_num}: {e}")
        return f"[Translation error for chunk {chunk_num}: {e}]"


def translate_document(client, doc: dict) -> str | None:
    """Translate a full document, handling chunking if needed."""

    local_path = doc.get('local_path')
    if not local_path:
        # Try to find file by filename pattern
        identifier = doc['identifier']
        possible_files = list(RAW_TEXTS_DIR.glob(f"*{identifier}*"))
        if possible_files:
            source_path = possible_files[0]
        else:
            print(f"  No local path for {doc['identifier']}")
            return None
    else:
        source_path = Path(local_path)
        if not source_path.exists():
            source_path = RAW_TEXTS_DIR / Path(local_path).name
            if not source_path.exists():
                print(f"  Source file not found: {local_path}")
                return None

    # Read source text
    text = source_path.read_text(encoding='utf-8', errors='ignore')
    source_lang = doc.get('language_code', 'la')
    lang_name = LANGUAGE_NAMES.get(source_lang, source_lang)

    print(f"  Source: {len(text):,} characters ({lang_name})")

    # Chunk the text
    chunks = chunk_text(text)
    print(f"  Split into {len(chunks)} chunk(s)")

    # Translate each chunk
    translated_chunks = []
    for i, chunk in enumerate(chunks, 1):
        print(f"  Translating chunk {i}/{len(chunks)}...", end=' ', flush=True)

        translated = translate_chunk(client, chunk, source_lang, i, len(chunks))
        translated_chunks.append(translated)

        print(f"done ({len(translated):,} chars)")

        # Rate limiting - be nice to the API
        if i < len(chunks):
            time.sleep(1)

    # Combine chunks
    full_translation = '\n\n'.join(translated_chunks)

    # Add header
    header = f"""# {doc['title']}
## By {doc.get('creator', 'Unknown')} ({doc['year']})
### LLM-generated translation from {lang_name}

---

"""

    footer = f"""

---

*This is an LLM-generated translation using Gemini. Technical terms preserved in brackets where appropriate.*
*Generated for the GEMI Digital Archive project.*
"""

    return header + full_translation + footer


def save_translation(doc: dict, translation: str) -> str:
    """Save translation to file and return filename."""

    TRANSLATIONS_DIR.mkdir(parents=True, exist_ok=True)

    # Generate filename
    year = doc['year']
    lang = doc.get('language_code', 'xx')
    identifier = doc['identifier']
    filename = f"{year}_{lang}_{identifier}_en.txt"

    filepath = TRANSLATIONS_DIR / filename
    filepath.write_text(translation, encoding='utf-8')

    print(f"  Saved: {filepath}")
    return filename


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Translate corpus texts using Gemini")
    parser.add_argument('--identifier', '-i', help="Translate specific document by identifier")
    parser.add_argument('--list', '-l', action='store_true', help="List documents needing translation")
    parser.add_argument('--force', '-f', action='store_true', help="Re-translate even if translation exists")
    args = parser.parse_args()

    print("=" * 60)
    print("GEMI Corpus Translation (Gemini)")
    print("=" * 60 + "\n")

    # Load metadata
    metadata = load_metadata()
    print(f"Loaded {len(metadata)} documents\n")

    # Find documents needing translation
    if args.identifier:
        # Find specific document
        docs = [d for d in metadata if d['identifier'] == args.identifier]
        if not docs:
            print(f"Error: Document not found: {args.identifier}")
            sys.exit(1)
        if not args.force and docs[0].get('has_translation'):
            print(f"Document already has translation. Use --force to re-translate.")
            sys.exit(0)
    else:
        docs = get_documents_needing_translation(metadata)

    # List mode
    if args.list:
        print("Documents needing translation:")
        print("-" * 60)
        for doc in docs:
            lang = doc.get('language_code', '?')
            lang_name = LANGUAGE_NAMES.get(lang, lang)
            chars = doc.get('char_count', 0)
            print(f"  {doc['year']} [{lang_name:8}] {doc['identifier'][:40]}... ({chars:,} chars)")
        print(f"\nTotal: {len(docs)} documents")
        return

    if not docs:
        print("No documents need translation!")
        return

    # Setup Gemini
    print("Initializing Gemini API...")
    client = setup_gemini()
    print(f"Using model: {MODEL_NAME}\n")

    # Translate each document
    for i, doc in enumerate(docs, 1):
        print(f"\n[{i}/{len(docs)}] {doc['identifier']}")
        print(f"  Title: {doc['title'][:60]}...")

        translation = translate_document(client, doc)

        if translation:
            filename = save_translation(doc, translation)

            # Update metadata
            for d in metadata:
                if d['identifier'] == doc['identifier']:
                    d['has_translation'] = True
                    d['translation_filename'] = filename
                    break

            save_metadata(metadata)
            print(f"  ✓ Translation complete!")
        else:
            print(f"  ✗ Translation failed")

    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == "__main__":
    main()
