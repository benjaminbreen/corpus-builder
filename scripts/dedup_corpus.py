#!/usr/bin/env python3
"""
Corpus Deduplication (Exact + Near-Duplicate)

Builds a deduplication report by grouping candidate duplicates using
normalized metadata and comparing text fingerprints.

Usage:
    python scripts/dedup_corpus.py --metadata corpus/metadata.json
    python scripts/dedup_corpus.py --metadata corpus/metadata.json --root corpus/raw_texts
"""

import argparse
import hashlib
import json
import re
from itertools import combinations
from pathlib import Path
from typing import Dict, List, Optional


def normalize_key(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^\w\s]", "", text)
    return text.strip()


def stable_hash64(value: str) -> int:
    digest = hashlib.blake2b(value.encode("utf-8", errors="ignore"), digest_size=8).digest()
    return int.from_bytes(digest, "big", signed=False)


def simhash(tokens: List[str]) -> int:
    if not tokens:
        return 0
    v = [0] * 64
    for token in tokens:
        h = stable_hash64(token)
        for i in range(64):
            bit = 1 if (h >> i) & 1 else -1
            v[i] += bit
    result = 0
    for i in range(64):
        if v[i] > 0:
            result |= 1 << i
    return result


def hamming_distance(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def text_fingerprint(text: str, max_tokens: int = 20000) -> Dict[str, object]:
    normalized = normalize_text(text)
    tokens = re.findall(r"\w+", normalized)[:max_tokens]
    return {
        "exact_hash": hashlib.sha1(normalized.encode("utf-8", errors="ignore")).hexdigest(),
        "simhash": simhash(tokens),
        "token_count": len(tokens),
    }


def load_metadata(path: Path) -> List[dict]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    return []


def load_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def best_candidate(entries: List[dict]) -> Optional[str]:
    def score(entry: dict) -> float:
        if "ocr_quality_score" in entry:
            return float(entry.get("ocr_quality_score") or 0)
        return float(entry.get("char_count") or 0)
    if not entries:
        return None
    return max(entries, key=score).get("identifier")


def main() -> None:
    parser = argparse.ArgumentParser(description="Deduplicate corpus items.")
    parser.add_argument("--metadata", type=str, default="corpus/metadata.json", help="Metadata JSON path")
    parser.add_argument("--root", type=str, default="corpus/raw_texts", help="Root directory for .txt files")
    parser.add_argument("--report", type=str, default="corpus/dedup_report.json", help="Output report path")
    parser.add_argument("--near-threshold", type=int, default=3, help="Hamming distance threshold for near-duplicates")
    parser.add_argument("--limit", type=int, default=0, help="Limit groups processed (0 = no limit)")
    args = parser.parse_args()

    metadata_path = Path(args.metadata)
    root = Path(args.root)
    report_path = Path(args.report)

    metadata = load_metadata(metadata_path)
    by_key: Dict[str, List[dict]] = {}

    for entry in metadata:
        title = normalize_key(entry.get("title", ""))
        creator = normalize_key(entry.get("creator", ""))
        year = str(entry.get("year", ""))
        key = normalize_key(f"{title} {creator} {year}")
        by_key.setdefault(key, []).append(entry)

    exact_duplicates = []
    near_duplicates = []
    processed_groups = 0

    for key, entries in by_key.items():
        if len(entries) < 2:
            continue
        if args.limit and processed_groups >= args.limit:
            break

        fingerprints = []
        for entry in entries:
            local_path = entry.get("local_path")
            if not local_path:
                continue
            path = Path(local_path)
            if not path.exists():
                path = root / Path(local_path).name
            text = load_text(path)
            fp = text_fingerprint(text)
            fp["identifier"] = entry.get("identifier")
            fp["path"] = str(path)
            fp["title"] = entry.get("title")
            fp["creator"] = entry.get("creator")
            fp["year"] = entry.get("year")
            fingerprints.append(fp)

        hash_groups: Dict[str, List[dict]] = {}
        for fp in fingerprints:
            hash_groups.setdefault(fp["exact_hash"], []).append(fp)

        for exact_hash, items in hash_groups.items():
            if len(items) > 1:
                exact_duplicates.append({
                    "key": key,
                    "exact_hash": exact_hash,
                    "items": items,
                    "suggested_keep": best_candidate(entries),
                })

        for a, b in combinations(fingerprints, 2):
            dist = hamming_distance(a["simhash"], b["simhash"])
            if dist <= args.near_threshold:
                near_duplicates.append({
                    "key": key,
                    "a": a,
                    "b": b,
                    "distance": dist,
                    "suggested_keep": best_candidate(entries),
                })

        processed_groups += 1

    report = {
        "group_count": sum(1 for v in by_key.values() if len(v) > 1),
        "exact_duplicates": exact_duplicates,
        "near_duplicates": near_duplicates,
    }

    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=True)

    print(
        f"Groups: {report['group_count']} "
        f"Exact: {len(exact_duplicates)} "
        f"Near: {len(near_duplicates)}"
    )


if __name__ == "__main__":
    main()
