#!/usr/bin/env python3
"""
Batch re-OCR for low-quality texts using IA PDFs + enhanced OCR.

Pipeline:
1. Load metadata.json and select entries below a threshold.
2. Download IA PDF by identifier.
3. Run scripts/ocr_enhanced.py at chosen DPI/lang.
4. Re-score and optionally promote if better.

Usage:
  python3 scripts/reocr_batch.py --metadata corpus/metadata.json --threshold 80
  python3 scripts/reocr_batch.py --threshold 80 --limit 3 --dry-run
"""

import argparse
import json
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Optional

from quality_score import score_text

try:
    from ia_pdf_ocr import IADownloader
except Exception:
    IADownloader = None


LANG_MAP = {
    "en": "eng",
    "fr": "fra",
    "de": "deu",
    "ru": "rus",
    "es": "spa",
    "la": "lat",
    "it": "ita",
}


def load_metadata(path: Path) -> List[dict]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def save_metadata(path: Path, data: List[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=True)


def check_deps() -> Optional[str]:
    # Basic external deps needed by ocr_enhanced.py
    if shutil.which("tesseract") is None:
        return "Missing `tesseract` binary."
    if shutil.which("pdftoppm") is None:
        return "Missing `pdftoppm` (poppler) binary."
    return None


def should_reocr(entry: dict, threshold: float, include_missing: bool) -> bool:
    score = entry.get("ocr_quality_score")
    if score is None:
        return include_missing
    try:
        return float(score) < threshold
    except Exception:
        return include_missing


def run_ocr(pdf_path: Path, output_path: Path, dpi: int, lang: str, max_pages: Optional[int]) -> bool:
    cmd = [
        "python3",
        "scripts/ocr_enhanced.py",
        "--pdf",
        str(pdf_path),
        "--output",
        str(output_path),
        "--dpi",
        str(dpi),
        "--lang",
        lang,
    ]
    if max_pages:
        cmd += ["--max-pages", str(max_pages)]
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        return False
    return True




def main() -> None:
    parser = argparse.ArgumentParser(description="Batch re-OCR low-quality texts.")
    parser.add_argument("--metadata", default="corpus/metadata.json")
    parser.add_argument("--threshold", type=float, default=80.0)
    parser.add_argument("--include-missing", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dpi", type=int, default=400, help="Single DPI (used if --dpi-list not set)")
    parser.add_argument("--dpi-list", default="400,600", help="Comma-separated DPIs to try")
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--promote", action="store_true", help="Replace original if new score is better")
    parser.add_argument("--force", action="store_true", help="Re-run even if already re-OCRed")
    parser.add_argument("--engine", choices=["tesseract"], default="tesseract")
    parser.add_argument("--tmp-dir", default="/tmp/gemi_reocr")
    parser.add_argument("--reocr-dir", default="corpus/reocr")
    args = parser.parse_args()

    meta_path = Path(args.metadata)
    data = load_metadata(meta_path)
    if not data:
        print("No metadata found.")
        return

    if IADownloader is None:
        print("Cannot import IADownloader. Install internetarchive or use IA PDFs manually.")
        return

    dep_error = check_deps()
    if dep_error:
        print(dep_error)
        return

    tmp_dir = Path(args.tmp_dir)
    tmp_dir.mkdir(parents=True, exist_ok=True)
    reocr_dir = Path(args.reocr_dir)
    reocr_dir.mkdir(parents=True, exist_ok=True)

    candidates = [e for e in data if should_reocr(e, args.threshold, args.include_missing)]
    def score_key(entry: dict) -> float:
        score = entry.get("ocr_quality_score")
        if score is None:
            return -1.0
        try:
            return float(score)
        except Exception:
            return -1.0
    candidates.sort(key=score_key)
    if args.limit:
        candidates = candidates[: args.limit]

    if not candidates:
        print("No candidates for re-OCR.")
        return

    downloader = IADownloader(str(tmp_dir))

    for entry in candidates:
        identifier = entry.get("identifier")
        local_path = entry.get("local_path")
        language_code = entry.get("language_code")
        lang = LANG_MAP.get(language_code, "eng")
        year = entry.get("year")
        try:
            year_int = int(str(year)[:4])
        except Exception:
            year_int = None

        if not args.force and entry.get("ocr_reocr_score") is not None:
            print("Skipping (already re-OCRed):", identifier)
            continue

        if not args.force:
            existing_reocr = reocr_dir / f"{identifier}_reocr.txt"
            if existing_reocr.exists():
                print("Skipping (re-OCR output exists):", identifier)
                continue


        if not identifier:
            print("Skipping (no identifier):", local_path)
            continue

        if args.dry_run:
            print(f"[DRY RUN] Would re-OCR {identifier} ({language_code})")
            continue

        existing_pdfs = list(tmp_dir.glob(f"*{identifier}*.pdf"))
        pdf_path = existing_pdfs[0] if existing_pdfs else None
        if not pdf_path:
            pdf_path = downloader.download_pdf(identifier)
        if not pdf_path:
            print("Failed to download PDF for:", identifier)
            continue

        dpi_list = [int(d.strip()) for d in args.dpi_list.split(",") if d.strip().isdigit()]
        if not dpi_list:
            dpi_list = [args.dpi]

        candidates = []
        for dpi in dpi_list:
            reocr_path = reocr_dir / f"{identifier}_reocr_{dpi}.txt"
            ok = run_ocr(
                pdf_path,
                reocr_path,
                dpi=dpi,
                lang=lang,
                max_pages=args.max_pages if args.max_pages > 0 else None,
            )
            if not ok:
                print("OCR failed for:", identifier, "at DPI", dpi)
                continue

            try:
                new_text = reocr_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                print("Failed to read re-OCR output for:", identifier, "at DPI", dpi)
                continue

            new_metrics = score_text(new_text, language_code)
            candidates.append({
                "dpi": dpi,
                "path": str(reocr_path),
                "score": new_metrics["score"],
                "metrics": new_metrics,
            })

        if not candidates:
            print("No successful OCR runs for:", identifier)
            continue

        best = max(candidates, key=lambda c: c["score"])
        old_score = entry.get("ocr_quality_score") or 0.0
        new_score = best["score"]

        entry["ocr_reocr_score"] = new_score
        entry["ocr_reocr_path"] = best["path"]
        entry["ocr_reocr_dpi"] = best["dpi"]
        entry["ocr_reocr_lang"] = lang
        entry["ocr_reocr_engine"] = "tesseract"
        entry["ocr_reocr_candidates"] = [
            {"dpi": c["dpi"], "path": c["path"], "score": c["score"]}
            for c in candidates
        ]

        if args.promote and local_path:
            if new_score > float(old_score):
                original_path = Path(local_path)
                if original_path.exists():
                    backup_dir = original_path.parent / "_backup"
                    backup_dir.mkdir(parents=True, exist_ok=True)
                    backup_path = backup_dir / (original_path.name + ".bak")
                    shutil.move(str(original_path), str(backup_path))
                shutil.copy(str(best["path"]), str(local_path))
                entry["ocr_quality_score"] = new_score
                entry["ocr_quality_needs_reocr"] = new_score < args.threshold
                entry["ocr_quality_metrics"] = {
                    k: v for k, v in best["metrics"].items()
                    if k != "score"
                }
                print(f"Promoted re-OCR for {identifier}: {old_score} -> {new_score}")
            else:
                print(f"Re-OCR not better for {identifier}: {old_score} -> {new_score}")
        else:
            print(f"Re-OCR complete for {identifier}: {old_score} -> {new_score}")

        save_metadata(meta_path, data)

    print("Done.")


if __name__ == "__main__":
    main()
