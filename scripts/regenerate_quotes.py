#!/usr/bin/env python3
"""
Regenerate auto-generated quotes in quotes.json using improved heuristics.

Preserves hand-curated quotes (those without the -q1/-q2 ID pattern).
Reads raw text files from public/raw_texts/ and corpus/raw_texts/.

Usage:
  python scripts/regenerate_quotes.py          # dry run
  python scripts/regenerate_quotes.py --apply  # actually write
"""

import argparse
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from ingest_curated_list import (
    get_keywords_for_language,
    infer_tags,
    select_quotes,
)

QUOTES_FILE = Path("public") / "data" / "quotes.json"
CORPUS_INDEX = Path("public") / "data" / "corpus-index.json"
RAW_DIRS = [Path("public") / "raw_texts", Path("corpus") / "raw_texts"]

AUTO_QUOTE_RE = re.compile(r"-q\d+$")


def find_raw_text(filename: str) -> str | None:
    for d in RAW_DIRS:
        p = d / filename
        if p.exists():
            return p.read_text(encoding="utf-8", errors="replace")
    return None


def main():
    parser = argparse.ArgumentParser(description="Regenerate auto-generated quotes")
    parser.add_argument("--apply", action="store_true", help="Write changes (default is dry run)")
    args = parser.parse_args()

    quotes: list[dict] = json.loads(QUOTES_FILE.read_text(encoding="utf-8")) if QUOTES_FILE.exists() else []
    corpus: list[dict] = json.loads(CORPUS_INDEX.read_text(encoding="utf-8")) if CORPUS_INDEX.exists() else []
    doc_lookup = {d["identifier"]: d for d in corpus}

    curated = [q for q in quotes if not AUTO_QUOTE_RE.search(q["id"])]
    auto = [q for q in quotes if AUTO_QUOTE_RE.search(q["id"])]

    # Group auto quotes by doc_id
    auto_doc_ids = sorted(set(q["doc_id"] for q in auto))

    print(f"Quotes total: {len(quotes)} ({len(curated)} curated, {len(auto)} auto-generated)")
    print(f"Auto-generated quotes span {len(auto_doc_ids)} documents")
    print()

    regenerated: list[dict] = []
    skipped = 0

    for doc_id in auto_doc_ids:
        doc = doc_lookup.get(doc_id)
        if not doc:
            print(f"  SKIP {doc_id}: not in corpus index")
            skipped += 1
            continue

        filename = doc.get("filename")
        if not filename:
            print(f"  SKIP {doc_id}: no filename")
            skipped += 1
            continue

        text = find_raw_text(filename)
        if not text:
            print(f"  SKIP {doc_id}: raw text not found ({filename})")
            skipped += 1
            continue

        lang = doc.get("language_code", "en")
        selections = select_quotes(text, lang, max_quotes=2)
        tags = infer_tags(doc.get("title", ""), doc.get("description", "") or "")

        for idx, quote_text in enumerate(selections, 1):
            quote_id = f"{doc_id}-q{idx}"
            regenerated.append({
                "id": quote_id,
                "doc_id": doc_id,
                "source_title": doc.get("title", ""),
                "year": doc.get("year", 0),
                "language_code": lang,
                "topic": doc.get("topic", ""),
                "page": "n/a",
                "tags": tags,
                "text": quote_text,
            })

        old_texts = [q["text"][:80] for q in auto if q["doc_id"] == doc_id]
        new_texts = [s[:80] for s in selections]
        changed = old_texts != new_texts
        marker = "CHANGED" if changed else "same"
        print(f"  {doc_id} [{marker}]:")
        for s in selections:
            print(f"    \"{s[:100]}...\"" if len(s) > 100 else f"    \"{s}\"")

    result = curated + regenerated
    print(f"\nResult: {len(curated)} curated + {len(regenerated)} regenerated = {len(result)} total")
    if skipped:
        print(f"Skipped {skipped} documents (missing text)")

    if args.apply:
        QUOTES_FILE.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nWrote {QUOTES_FILE}")
    else:
        print("\nDry run. Use --apply to write changes.")


if __name__ == "__main__":
    main()
