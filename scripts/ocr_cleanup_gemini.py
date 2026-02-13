#!/usr/bin/env python3
"""
LLM-based OCR cleanup using Gemini (same-language correction).

Usage:
  python3 scripts/ocr_cleanup_gemini.py --identifier ID --pages 1
  python3 scripts/ocr_cleanup_gemini.py --rank 5 --pages 1
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from dotenv import load_dotenv

from google import genai

CORPUS_DIR = Path("corpus")
METADATA_FILE = CORPUS_DIR / "metadata.json"
RAW_TEXTS_DIR = CORPUS_DIR / "raw_texts"
OUTPUT_DIR = CORPUS_DIR / "llm_cleaned"

MODEL_NAME = "gemini-2.5-flash-lite"


def setup_gemini():
    load_dotenv(".env.local")
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not found in environment")
        print("Set it in .env.local or export GEMINI_API_KEY=...")
        sys.exit(1)
    return genai.Client(api_key=api_key)


def load_metadata() -> list[dict]:
    if not METADATA_FILE.exists():
        print(f"Error: Metadata file not found: {METADATA_FILE}")
        sys.exit(1)
    with open(METADATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def select_by_rank(metadata: list[dict], rank: int) -> dict:
    rows = [r for r in metadata if r.get("ocr_quality_score") is not None]
    rows.sort(key=lambda r: r.get("ocr_quality_score"))
    if rank < 1 or rank > len(rows):
        print(f"Rank out of range: {rank} (1..{len(rows)})")
        sys.exit(1)
    return rows[rank - 1]


def resolve_source_path(doc: dict) -> Path:
    local_path = doc.get("local_path")
    if local_path:
        path = Path(local_path)
        if path.exists():
            return path
        alt = RAW_TEXTS_DIR / path.name
        if alt.exists():
            return alt
    identifier = doc.get("identifier")
    if identifier:
        matches = list(RAW_TEXTS_DIR.glob(f"*{identifier}*"))
        if matches:
            return matches[0]
    print("Could not resolve source path.")
    sys.exit(1)


def extract_pages(text: str, pages: int, gibberish_pages: set[int]) -> str:
    if pages <= 0:
        return text
    chunks = re.split(r"(?m)^--- Page \\d+ ---\\s*$", text)
    if len(chunks) <= 1:
        return text[:8000]
    # Reconstruct with page markers
    result = []
    page_count = 0
    for match in re.finditer(r"(?m)^--- Page \\d+ ---\\s*$", text):
        start = match.start()
        end = match.end()
        page_num = int(re.search(r"(\\d+)", match.group(0)).group(1))
        if page_num in gibberish_pages:
            continue
        # Find next marker
        next_match = re.search(r"(?m)^--- Page \\d+ ---\\s*$", text[end:])
        if next_match:
            page_text = text[start:end + next_match.start()]
        else:
            page_text = text[start:]
        result.append(page_text.strip())
        page_count += 1
        if page_count >= pages:
            break
    return "\n\n".join(result)


def cleanup_text(client, text: str, language_code: str) -> str:
    prompt = f"""You are correcting OCR errors in a historical text.

LANGUAGE CODE: {language_code}

TASK:
- Fix obvious OCR errors and broken words.
- Preserve original spelling (do not modernize).
- Remove pure garbage lines (random characters).
- Keep structure and line breaks as in the input.
- If uncertain, use [?] rather than guessing.

IMPORTANT:
- Output ONLY the corrected text (no commentary).
- Keep page markers like '--- Page N ---' intact.

INPUT TEXT:

{text}
"""
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt
    )
    return response.text.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="Gemini OCR cleanup")
    parser.add_argument("--identifier", help="Document identifier to process")
    parser.add_argument("--rank", type=int, help="Rank by OCR score (1=worst)")
    parser.add_argument("--pages", type=int, default=1, help="How many pages to process")
    args = parser.parse_args()

    metadata = load_metadata()
    if args.identifier:
        doc = next((d for d in metadata if d.get("identifier") == args.identifier), None)
        if not doc:
            print("Identifier not found.")
            sys.exit(1)
    elif args.rank:
        doc = select_by_rank(metadata, args.rank)
    else:
        print("Provide --identifier or --rank.")
        sys.exit(1)

    source_path = resolve_source_path(doc)
    text = source_path.read_text(encoding="utf-8", errors="ignore")
    gibberish_pages = set(doc.get("gibberish_pages", []))
    snippet = extract_pages(text, args.pages, gibberish_pages)

    client = setup_gemini()
    cleaned = cleanup_text(client, snippet, doc.get("language_code", "en"))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"{doc.get('identifier')}_cleaned_p{args.pages}.txt"
    out_path.write_text(cleaned, encoding="utf-8")

    print("Identifier:", doc.get("identifier"))
    print("Source:", source_path)
    print("Output:", out_path)


if __name__ == "__main__":
    main()
