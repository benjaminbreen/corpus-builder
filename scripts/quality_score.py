#!/usr/bin/env python3
"""
OCR/Text Quality Scoring

Heuristic quality scoring for OCR text to decide when to re-OCR or exclude.
Outputs a per-file report and can optionally update corpus/metadata.json.

Usage:
    python scripts/quality_score.py --root corpus/raw_texts
    python scripts/quality_score.py --root ia_output --report corpus/quality_report.json
    python scripts/quality_score.py --metadata corpus/metadata.json --update-metadata
    python scripts/quality_score.py --min-score 75
"""

import argparse
import json
import math
import re
from pathlib import Path
from typing import Dict, Iterable, Optional


LATIN_VOWELS = set("aeiouyAEIOUY")
LATIN_VOWELS.update(
    list("àáâãäåæçèéêëìíîïñòóôõöœùúûüýÿ")
    + list("ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖŒÙÚÛÜÝŸ")
)
CYRILLIC_VOWELS = set("аеёиоуыэюяАЕЁИОУЫЭЮЯ")


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def detect_vowel_set(language_code: Optional[str]) -> set:
    if language_code == "ru":
        return CYRILLIC_VOWELS
    return LATIN_VOWELS


def iter_text_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*.txt"):
        if path.is_file():
            yield path


def count_repeated_chars(text: str) -> int:
    return len(re.findall(r"(.)\1\1", text))


def extract_tokens(text: str, language_code: Optional[str]) -> list[str]:
    if language_code == "ru":
        return re.findall(r"[А-Яа-яЁё]+", text)
    return re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ]+", text)


def score_text(text: str, language_code: Optional[str] = None) -> Dict[str, float]:
    total_chars = max(len(text), 1)

    letters = sum(1 for c in text if c.isalpha())
    digits = sum(1 for c in text if c.isdigit())
    whitespace = sum(1 for c in text if c.isspace())
    symbols = total_chars - letters - digits - whitespace

    tokens = extract_tokens(text, language_code)
    token_count = max(len(tokens), 1)
    avg_word_len = sum(len(t) for t in tokens) / token_count

    long_word_ratio = sum(1 for t in tokens if len(t) > 18) / token_count
    short_word_ratio = sum(1 for t in tokens if len(t) <= 2) / token_count

    vowel_set = detect_vowel_set(language_code)
    no_vowel_ratio = sum(1 for t in tokens if not set(t) & vowel_set) / token_count

    repeat_char_ratio = count_repeated_chars(text) / max(total_chars, 1)

    hyphen_breaks = len(re.findall(r"-\s*\n", text))
    line_breaks = max(text.count("\n"), 1)
    hyphen_break_ratio = hyphen_breaks / line_breaks

    lines = text.splitlines()
    noise_lines = 0
    low_alpha_lines = 0
    short_lines = 0
    slash_pipe_lines = 0
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        words = extract_tokens(stripped, language_code)
        if len(words) < 2 and len(stripped) < 20:
            noise_lines += 1
        if len(stripped) < 30:
            short_lines += 1
        line_letters = sum(1 for c in stripped if c.isalpha())
        line_total = max(len(stripped), 1)
        if (line_letters / line_total) < 0.5:
            low_alpha_lines += 1
        if stripped.count("/") + stripped.count("|") > 3:
            slash_pipe_lines += 1
    line_noise_ratio = noise_lines / max(len(lines), 1)
    low_alpha_line_ratio = low_alpha_lines / max(len(lines), 1)
    short_line_ratio = short_lines / max(len(lines), 1)
    slash_pipe_line_ratio = slash_pipe_lines / max(len(lines), 1)

    alpha_ratio = letters / total_chars
    digit_ratio = digits / total_chars
    symbol_ratio = symbols / total_chars

    tokens_nonalpha = sum(1 for t in re.findall(r"\S+", text) if not re.search(r"[A-Za-zÀ-ÖØ-öø-ÿА-Яа-яЁё]", t))
    nonalpha_token_ratio = tokens_nonalpha / max(len(re.findall(r"\S+", text)), 1)

    junk_token_ratio = sum(
        1 for t in re.findall(r"\S+", text)
        if re.search(r"[\\/|]", t) or re.search(r"\d", t) and re.search(r"[A-Za-zÀ-ÖØ-öø-ÿА-Яа-яЁё]", t)
    ) / max(len(re.findall(r"\S+", text)), 1)

    score = 100.0
    score -= 50.0 * symbol_ratio
    score -= 30.0 * digit_ratio
    score -= 20.0 * no_vowel_ratio
    score -= 10.0 * long_word_ratio
    score -= 10.0 * repeat_char_ratio
    score -= 20.0 * line_noise_ratio
    score -= 20.0 * low_alpha_line_ratio
    score -= 10.0 * short_line_ratio
    score -= 10.0 * slash_pipe_line_ratio
    score -= 5.0 * hyphen_break_ratio
    score -= 5.0 * short_word_ratio
    score -= 15.0 * nonalpha_token_ratio
    score -= 15.0 * junk_token_ratio

    score = max(0.0, min(100.0, score))

    return {
        "score": round(score, 2),
        "alpha_ratio": round(alpha_ratio, 4),
        "digit_ratio": round(digit_ratio, 4),
        "symbol_ratio": round(symbol_ratio, 4),
        "avg_word_len": round(avg_word_len, 2),
        "long_word_ratio": round(long_word_ratio, 4),
        "short_word_ratio": round(short_word_ratio, 4),
        "no_vowel_ratio": round(no_vowel_ratio, 4),
        "repeat_char_ratio": round(repeat_char_ratio, 6),
        "hyphen_break_ratio": round(hyphen_break_ratio, 4),
        "line_noise_ratio": round(line_noise_ratio, 4),
        "low_alpha_line_ratio": round(low_alpha_line_ratio, 4),
        "short_line_ratio": round(short_line_ratio, 4),
        "slash_pipe_line_ratio": round(slash_pipe_line_ratio, 4),
        "nonalpha_token_ratio": round(nonalpha_token_ratio, 4),
        "junk_token_ratio": round(junk_token_ratio, 4),
        "token_count": token_count,
        "char_count": total_chars,
    }


def load_metadata(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    return []


def index_metadata_by_path(metadata: list[dict]) -> Dict[str, dict]:
    by_path = {}
    for entry in metadata:
        local_path = entry.get("local_path")
        if local_path:
            by_path[local_path] = entry
    return by_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Score OCR/text quality.")
    parser.add_argument("--root", type=str, default="corpus/raw_texts", help="Root directory for .txt files")
    parser.add_argument("--report", type=str, default="corpus/quality_report.json", help="Output report path")
    parser.add_argument("--metadata", type=str, default="corpus/metadata.json", help="Metadata JSON path")
    parser.add_argument("--update-metadata", action="store_true", help="Write score fields into metadata.json")
    parser.add_argument("--min-score", type=float, default=75.0, help="Threshold for needs_reocr")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of files processed (0 = no limit)")
    args = parser.parse_args()

    root = Path(args.root)
    report_path = Path(args.report)
    metadata_path = Path(args.metadata)

    metadata = load_metadata(metadata_path) if args.update_metadata else []
    metadata_by_path = index_metadata_by_path(metadata) if metadata else {}

    results = []
    processed = 0

    for path in iter_text_files(root):
        if args.limit and processed >= args.limit:
            break
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        entry = metadata_by_path.get(str(path))
        language_code = entry.get("language_code") if entry else None

        metrics = score_text(text, language_code)
        metrics["path"] = str(path)
        metrics["language_code"] = language_code
        metrics["needs_reocr"] = metrics["score"] < args.min_score

        results.append(metrics)
        processed += 1

        if args.update_metadata and entry is not None:
            entry["ocr_quality_score"] = metrics["score"]
            entry["ocr_quality_needs_reocr"] = metrics["needs_reocr"]
            entry["ocr_quality_metrics"] = {
                k: v for k, v in metrics.items()
                if k not in {"path", "language_code", "needs_reocr"}
            }

    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=True)

    if args.update_metadata and metadata:
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=True)

    scores = [r["score"] for r in results]
    if scores:
        avg = sum(scores) / len(scores)
        median = sorted(scores)[len(scores) // 2]
        print(f"Scored {len(scores)} files. Avg={avg:.2f} Median={median:.2f}")
    else:
        print("No files scored.")


if __name__ == "__main__":
    main()
