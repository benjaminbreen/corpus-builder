#!/usr/bin/env python3
"""
Mark gibberish pages in OCR texts using a minimal heuristic.

Heuristic (minimal, fast):
- Compute alpha_ratio per page.
- If alpha_ratio < 0.45 OR (alpha_ratio < 0.55 and short_line_ratio > 0.6),
  mark page as gibberish.

Usage:
  python3 scripts/mark_gibberish_pages.py
  python3 scripts/mark_gibberish_pages.py --limit 50
"""

import argparse
import json
import re
from pathlib import Path

CORPUS_DIR = Path("corpus")
METADATA_FILE = CORPUS_DIR / "metadata.json"
RAW_TEXTS_DIR = CORPUS_DIR / "raw_texts"


def load_metadata() -> list[dict]:
    if not METADATA_FILE.exists():
        raise SystemExit(f"Metadata file not found: {METADATA_FILE}")
    with open(METADATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_metadata(metadata: list[dict]) -> None:
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=True)


def split_pages(text: str) -> list[tuple[int, str]]:
    parts = re.split(r"(?m)^--- Page (\\d+) ---\\s*$", text)
    if len(parts) < 3:
        return []
    pages = []
    for i in range(1, len(parts), 2):
        num = parts[i]
        content = parts[i + 1]
        try:
            page_num = int(num)
        except ValueError:
            continue
        pages.append((page_num, content))
    return pages


def page_metrics(text: str) -> tuple[float, float]:
    total = max(len(text), 1)
    letters = sum(1 for c in text if c.isalpha())
    alpha_ratio = letters / total

    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return alpha_ratio, 1.0
    short_lines = sum(1 for ln in lines if len(ln.strip()) < 30)
    short_line_ratio = short_lines / max(len(lines), 1)
    return alpha_ratio, short_line_ratio


def is_gibberish(alpha_ratio: float, short_line_ratio: float) -> bool:
    return alpha_ratio < 0.45 or (alpha_ratio < 0.55 and short_line_ratio > 0.6)


def main() -> None:
    parser = argparse.ArgumentParser(description="Mark gibberish pages in metadata.")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of docs processed")
    args = parser.parse_args()

    metadata = load_metadata()
    processed = 0

    for doc in metadata:
        local_path = doc.get("local_path")
        if not local_path:
            continue
        path = Path(local_path)
        if not path.exists():
            path = RAW_TEXTS_DIR / Path(local_path).name
            if not path.exists():
                continue

        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        pages = split_pages(text)
        if not pages:
            doc["gibberish_pages"] = []
            processed += 1
            if args.limit and processed >= args.limit:
                break
            continue

        gibberish = []
        for page_num, page_text in pages:
            alpha_ratio, short_line_ratio = page_metrics(page_text)
            if is_gibberish(alpha_ratio, short_line_ratio):
                gibberish.append(page_num)

        doc["gibberish_pages"] = gibberish
        processed += 1
        if args.limit and processed >= args.limit:
            break

    save_metadata(metadata)
    print(f"Processed {processed} documents.")


if __name__ == "__main__":
    main()
