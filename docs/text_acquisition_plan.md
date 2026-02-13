# GEMI Text Acquisition Plan (1600-1950)

This document combines three deliverables:
1. A source matrix by language and century focus
2. A quality scoring and re-OCR strategy
3. A deduplication strategy for multi-source ingestion

## 1) Source Matrix (Deep Cuts, Multilingual)

Priority window: 1600-1950. Priority languages: English, French, German, Russian, Spanish, Latin.

**English**
- Primary: Internet Archive, HathiTrust, Google Books (public domain)
- Secondary: Project Gutenberg (curated), university digital collections
- Notes: Use IA and HathiTrust for breadth; Gutenberg for clean baselines and canonical texts.

**French**
- Primary: Gallica (BnF), Internet Archive, Google Books
- Secondary: HathiTrust (French holdings), university collections
- Notes: Gallica has large coverage of 17th-19th c. French texts; pair with IA for esoterica.

**German**
- Primary: Bayerische Staatsbibliothek (MDZ), Deutsche Digitale Bibliothek, Internet Archive
- Secondary: HathiTrust, Google Books
- Notes: BSB/MDZ is especially strong for early modern and 19th c. materials.

**Russian**
- Primary: National Library of Russia digital collections, Internet Archive
- Secondary: Google Books (limited), regional university collections
- Notes: Expect variable OCR quality; prioritize re-OCR for 18th-19th c. Cyrillic.

**Spanish**
- Primary: Biblioteca Nacional de Espana (BNE), Biblioteca Virtual Miguel de Cervantes, Internet Archive
- Secondary: Google Books, HathiTrust (Spanish holdings)
- Notes: BNE and Cervantes are strong for 17th-19th c. Spanish texts.

**Latin**
- Primary: Google Books (public domain), Internet Archive, Gallica (Latin holdings)
- Secondary: HathiTrust, regional university collections
- Notes: Many Latin texts are early modern and have heavy long-s and ligature artifacts.

## 2) Quality Scoring and Re-OCR Strategy

Goal: treat OCR as draft text, score it, and re-OCR selectively.

**Quality scoring**
- Implemented in `scripts/quality_score.py`.
- Scores each text 0-100 using heuristics:
  - Symbol and digit ratios
  - Token vowel coverage (language-aware)
  - Long-token and repeat-character ratios
  - Line noise and hyphen-break ratios

**Re-OCR triggers**
- Default `needs_reocr` if score < 75.
- Lower threshold for 1900-1950 materials if scans are good.
- Raise threshold for 1600-1750 materials where OCR is inherently noisier.

**Re-OCR workflow**
1. Run `scripts/quality_score.py` on corpus text.
2. Filter `needs_reocr` items.
3. Re-OCR from the best available PDF or image set.
4. Re-score and keep the best version.

## 3) Deduplication Strategy

Goal: multiple archives often carry the same edition. We want the cleanest copy.

**Dedup keys**
- Normalize `title + creator + year` to form candidate duplicate groups.
- Use exact text hash for identical OCR output.
- Use SimHash (64-bit) to find near-duplicates within a group.

**Selection rule**
- Keep the item with highest `ocr_quality_score`.
- If scores are missing, keep the one with highest `char_count`.

**Implementation**
- Implemented in `scripts/dedup_corpus.py`.
- Outputs `corpus/dedup_report.json` with exact and near-duplicate groups.

## Suggested Next Runs

1. Score current corpus:
   - `python scripts/quality_score.py --root corpus/raw_texts --report corpus/quality_report.json`
2. Update metadata with scores:
   - `python scripts/quality_score.py --metadata corpus/metadata.json --update-metadata`
3. Generate dedup report:
   - `python scripts/dedup_corpus.py --metadata corpus/metadata.json --root corpus/raw_texts`
