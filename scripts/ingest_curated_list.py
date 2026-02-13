#!/usr/bin/env python3
"""
Ingest a curated list of sources into the GEMI corpus.

Reads a YAML config with items (Wikisource or Gutenberg), downloads full text,
stores in corpus/raw_texts, updates metadata.json, and appends key quotes.

Usage:
  python scripts/ingest_curated_list.py --config config/curated_computing.yaml
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from wikisource_download import WikisourceDownloader  # noqa: E402
import gutenberg_historical_corpus as ghc  # noqa: E402

try:
    import yaml
except ImportError:
    print("Error: PyYAML not installed. Run: pip install pyyaml")
    sys.exit(1)

CORPUS_DIR = Path("corpus")
METADATA_FILE = CORPUS_DIR / "metadata.json"
QUOTES_FILE = Path("public") / "data" / "quotes.json"

GUTENDEX_URL = "https://gutendex.com/books"

LANGUAGE_NAMES = ghc.LANGUAGE_NAMES


def load_yaml_config(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_metadata() -> list[dict]:
    if METADATA_FILE.exists():
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_metadata(metadata: list[dict]) -> None:
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)


def load_quotes() -> list[dict]:
    if QUOTES_FILE.exists():
        return json.loads(QUOTES_FILE.read_text(encoding="utf-8"))
    return []


def save_quotes(quotes: list[dict]) -> None:
    QUOTES_FILE.parent.mkdir(parents=True, exist_ok=True)
    QUOTES_FILE.write_text(json.dumps(quotes, indent=2, ensure_ascii=False), encoding="utf-8")


def choose_text_url(formats: dict) -> Optional[str]:
    if not formats:
        return None
    for key, url in formats.items():
        if key.startswith("text/plain; charset=utf-8"):
            return url
    for key, url in formats.items():
        if key.startswith("text/plain"):
            return url
    return None


def download_gutenberg_text(ebook_id: int) -> tuple[Optional[str], Optional[str], Optional[str]]:
    try:
        resp = requests.get(f"{GUTENDEX_URL}/{ebook_id}", timeout=30)
        resp.raise_for_status()
        book = resp.json()
        text_url = choose_text_url(book.get("formats", {}))
        if not text_url:
            return None, None, None
        text_resp = requests.get(text_url, timeout=60)
        text_resp.raise_for_status()
        return text_resp.text, text_url, book.get("title")
    except Exception as exc:
        print(f"  ! Gutenberg fetch failed for {ebook_id}: {exc}")
        return None, None, None


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def get_keywords_for_language(lang: str) -> list[str]:
    if lang == "fr":
        return ["calcul", "machine", "arithm", "compt", "abac", "calculateur"]
    if lang == "de":
        return ["rechen", "rechenmaschine", "maschine", "arithm", "rechn"]
    if lang == "ru":
        return ["вычис", "счет", "счёт", "арифмометр", "машин", "счётн", "таблиц"]
    return [
        "calculat",
        "compute",
        "computation",
        "engine",
        "machine",
        "arithm",
        "mechanical",
        "difference",
        "analytical",
        "comptometer",
        "arithmometer",
        "abacus",
        "reckon",
        "tabulat",
    ]


def split_sentences(text: str) -> list[str]:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []
    return re.split(r"(?<=[.!?])\s+", cleaned)


# Patterns that indicate boilerplate / non-content text
_BOILERPLATE_RE = re.compile(
    r"project\s+gutenberg|gutenberg\.org|ebook|e-book|public\s+domain|"
    r"copyright|license|permission|trademark|distribute|archive\.org|"
    r"internet\s+archive|digitized\s+by|scanned\s+by|transcriber|"
    r"plain\s+text|utf-?8|ascii|encoding|proofreading|"
    r"table\s+of\s+contents|chapter\s+[ivxlc\d]+\b|^\s*\d+\s*$|"
    r"all\s+rights\s+reserved|reproduced|permission\s+of|"
    r"this\s+ebook|this\s+e-book|this\s+file|downloaded\s+from|"
    r"wikisource|wikipedia",
    re.IGNORECASE,
)

# Signals of substantive, quotable prose
_INTEREST_SIGNALS_EN = re.compile(
    r"\b(?:remarkable|extraordinary|curious|ingenious|beautiful|"
    r"wonderful|impossible|necessary|important|discovered|invented|"
    r"argued|believed|conceived|demonstrated|observed|proposed|"
    r"contended|proved|imagined|constructed|designed|"
    r"intelligence|reason|thought|mind|brain|soul|spirit|"
    r"automaton|automata|mechanism|invention|discovery|"
    r"philosophy|science|nature|power|principle|theory|"
    r"human|artificial|mechanical|mathematical)\b",
    re.IGNORECASE,
)


def strip_gutenberg_boilerplate(text: str) -> str:
    """Remove Project Gutenberg / IA header and footer boilerplate."""
    # Gutenberg start marker
    start_markers = [
        r"\*\*\*\s*START OF TH(?:IS|E) PROJECT GUTENBERG EBOOK",
        r"\*\*\*\s*START OF THE PROJECT GUTENBERG",
    ]
    for pattern in start_markers:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            text = text[m.end():]
            break

    # Gutenberg end marker
    end_markers = [
        r"\*\*\*\s*END OF TH(?:IS|E) PROJECT GUTENBERG EBOOK",
        r"\*\*\*\s*END OF THE PROJECT GUTENBERG",
    ]
    for pattern in end_markers:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            text = text[:m.start()]
            break

    return text.strip()


def _score_sentence(sentence: str, keywords: list[str], position_ratio: float, lang: str) -> float:
    """Score a sentence for quote-worthiness. Higher = better."""
    lower = sentence.lower()
    length = len(sentence)

    # Hard reject: boilerplate
    if _BOILERPLATE_RE.search(lower):
        return -1.0

    # Hard reject: too short, too long, or mostly digits/punctuation
    if length < 80 or length > 500:
        return -1.0
    alpha_ratio = sum(1 for c in sentence if c.isalpha()) / max(length, 1)
    if alpha_ratio < 0.65:
        return -1.0

    score = 0.0

    # Keyword hits (each distinct keyword match adds points)
    keyword_hits = sum(1 for k in keywords if k in lower)
    score += keyword_hits * 3.0

    # Length sweet spot: 120-350 chars is ideal
    if 120 <= length <= 350:
        score += 2.0
    elif 80 <= length <= 120 or 350 <= length <= 500:
        score += 0.5

    # Position: prefer middle 20%-80% of text (avoid boilerplate zones)
    if 0.15 <= position_ratio <= 0.85:
        score += 2.0
    elif 0.05 <= position_ratio <= 0.95:
        score += 0.5
    else:
        score -= 2.0

    # Interestingness signals (for English; other languages get keyword-only scoring)
    if lang in ("en", "eng"):
        interest_hits = len(_INTEREST_SIGNALS_EN.findall(sentence))
        score += min(interest_hits, 4) * 1.5

    # Bonus: sentences with quoted speech or specific proper nouns
    if '"' in sentence or '\u201c' in sentence:
        score += 1.0

    # Penalty: starts with very common filler
    filler_starts = ("the ", "a ", "an ", "it ", "this ", "that ", "in ", "on ", "and ")
    if lower.startswith(filler_starts):
        score -= 0.5

    # Bonus: starts with a name or strong subject (capitalized word not at sentence start)
    words = sentence.split()
    if len(words) >= 3 and words[0][0].isupper() and words[0].isalpha():
        # Likely a proper noun or strong subject opening
        score += 0.5

    return score


def select_quotes(text: str, lang: str, max_quotes: int = 2) -> list[str]:
    keywords = get_keywords_for_language(lang)

    # Strip boilerplate before processing
    cleaned_text = strip_gutenberg_boilerplate(text)
    total_len = max(len(cleaned_text), 1)

    sentences = split_sentences(cleaned_text)
    if not sentences:
        return []

    # Score every sentence
    scored: list[tuple[float, int, str]] = []
    char_cursor = 0
    for idx, sentence in enumerate(sentences):
        position_ratio = char_cursor / total_len
        s = _score_sentence(sentence, keywords, position_ratio, lang)
        if s > 0:
            scored.append((s, idx, sentence))
        char_cursor += len(sentence) + 1

    # Sort by score descending, then by position (prefer earlier for ties)
    scored.sort(key=lambda x: (-x[0], x[1]))

    # Pick top quotes, avoiding near-duplicates
    selected: list[str] = []
    for _score, _idx, sentence in scored:
        # Skip if too similar to an already-selected quote
        if any(_overlap(sentence, s) for s in selected):
            continue
        selected.append(sentence)
        if len(selected) >= max_quotes:
            break

    return selected


def _overlap(a: str, b: str) -> bool:
    """Check if two sentences share significant content (>40% word overlap)."""
    words_a = set(a.lower().split())
    words_b = set(b.lower().split())
    if not words_a or not words_b:
        return False
    intersection = words_a & words_b
    smaller = min(len(words_a), len(words_b))
    return len(intersection) / smaller > 0.4


def infer_tags(title: str, summary: str) -> list[str]:
    blob = f"{title} {summary}".lower()
    tags = ["Computation", "Machines"]

    if any(k in blob for k in ["engine", "analytical", "difference"]):
        tags.append("Engines")
    if any(k in blob for k in ["comptometer", "office", "newsletter", "school"]):
        tags.append("Office Work")
    if any(k in blob for k in ["inaudi", "mental", "calculateur"]):
        tags.append("Mental Calculation")
    if any(k in blob for k in ["abacus", "rechenmaschine", "arithmometer"]):
        tags.append("Abacus")
    if any(k in blob for k in ["blind", "blindenanstalt"]):
        tags.append("Accessibility")
    if any(k in blob for k in ["encyclop", "dictionary"]):
        tags.append("Reference")
    if any(k in blob for k in ["novel", "roman", "fauteuil", "par fil", "krasnaya", "erewhon"]):
        tags.append("Fiction")
    if any(k in blob for k in ["manual", "methods of operating"]):
        tags.append("Training")

    return list(dict.fromkeys(tags))


def ensure_directories():
    ghc.setup_directories()
    QUOTES_FILE.parent.mkdir(parents=True, exist_ok=True)


def ingest_item(item: dict, topic: str, metadata: list[dict], existing_ids: set[str]) -> tuple[Optional[dict], Optional[str]]:
    identifier = item["identifier"]
    if identifier in existing_ids:
        print(f"  Skipping existing: {identifier}")
        return None, None

    title = item["title"]
    year = int(item["year"])
    language_code = item.get("language_code", "en")
    summary = item.get("summary")

    text = None
    text_url = None

    if item["source"] == "wikisource":
        downloader = WikisourceDownloader(lang=item["wikisource_lang"])
        try:
            text = downloader.download_work(item["wikisource_title"])
        except Exception as exc:
            print(f"  ! Wikisource fetch failed for {identifier}: {exc}")
            return None, None
        text_url = item.get("source_url")
        if not text.strip():
            print(f"  ! No text downloaded for {identifier}")
            return None, None
    elif item["source"] == "gutenberg":
        text, text_url, resolved_title = download_gutenberg_text(item["gutenberg_id"])
        if not text:
            print(f"  ! No text downloaded for {identifier}")
            return None, None
        if resolved_title:
            title = resolved_title
    else:
        print(f"  ! Unknown source: {item['source']}")
        return None, None

    text = normalize_text(text)

    local_path = ghc.save_text(
        text=text,
        identifier=identifier,
        year=year,
        topic=topic,
        language=language_code,
    )

    doc = {
        "identifier": identifier,
        "title": title,
        "year": year,
        "date": f"{year}-01-01T00:00:00Z",
        "creator": item.get("author"),
        "description": summary,
        "summary": summary,
        "subject": None,
        "topic": topic,
        "search_term": None,
        "language_code": language_code,
        "language": LANGUAGE_NAMES.get(language_code, language_code),
        "source_url": item.get("source_url"),
        "text_url": text_url,
        "char_count": len(text),
        "downloaded_at": datetime.utcnow().isoformat(),
        "local_path": local_path,
        "source": item.get("source"),
        "ocr_source": f"{item.get('source')}_plain_text",
    }

    metadata.append(doc)
    existing_ids.add(identifier)
    return doc, text


def build_quotes_for_doc(doc: dict, text: str) -> list[dict]:
    quotes = []
    lang = doc.get("language_code", "en")
    selections = select_quotes(text, lang, max_quotes=2)
    tags = infer_tags(doc.get("title", ""), doc.get("summary", "") or "")

    for idx, quote in enumerate(selections, 1):
        quote_id = f"{doc['identifier']}-q{idx}"
        quotes.append(
            {
                "id": quote_id,
                "doc_id": doc["identifier"],
                "source_title": doc["title"],
                "year": doc["year"],
                "language_code": lang,
                "topic": doc["topic"],
                "page": "n/a",
                "tags": tags,
                "text": quote,
            }
        )
    return quotes


def main():
    parser = argparse.ArgumentParser(description="Ingest curated list into corpus")
    parser.add_argument("--config", default="config/curated_computing.yaml", help="YAML config path")
    args = parser.parse_args()

    ensure_directories()

    config_path = Path(args.config)
    config = load_yaml_config(config_path)

    topic = config.get("topic", "computing")
    items = config.get("items", [])

    metadata = load_metadata()
    existing_ids = {doc.get("identifier") for doc in metadata}

    quotes = load_quotes()
    existing_quote_ids = {q.get("id") for q in quotes}

    added = 0
    added_quotes = 0

    for item in items:
        print(f"Ingesting: {item['identifier']} ({item['title']})")
        doc, text = ingest_item(item, topic, metadata, existing_ids)
        if not doc:
            continue

        new_quotes = build_quotes_for_doc(doc, text)
        new_quotes = [q for q in new_quotes if q["id"] not in existing_quote_ids]
        quotes.extend(new_quotes)
        for q in new_quotes:
            existing_quote_ids.add(q["id"])

        added += 1
        added_quotes += len(new_quotes)

    if added:
        save_metadata(metadata)
        print(f"✓ Added {added} documents")
    else:
        print("No new documents added")

    if added_quotes:
        save_quotes(quotes)
        print(f"✓ Added {added_quotes} quotes")
    else:
        print("No new quotes added")


if __name__ == "__main__":
    main()
