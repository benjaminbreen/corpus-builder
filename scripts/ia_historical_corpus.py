#!/usr/bin/env python3
"""
Internet Archive Historical Corpus Builder

Downloads OCR'd text from Internet Archive for historical research
on topics like automation, thinking machines, computing, etc.

Usage:
    pip install internetarchive requests
    python ia_historical_corpus.py

Output structure:
    corpus/
    ├── metadata.json          # Index of all downloaded items
    ├── by_decade/
    │   ├── 1850s/
    │   ├── 1860s/
    │   └── ...
    └── by_topic/
        ├── calculating_machines/
        ├── automation/
        └── ...
"""

import os
import json
import time
import re
from pathlib import Path
from datetime import datetime
from typing import Optional
import internetarchive as ia
import requests

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════════════════
# MULTILINGUAL SEARCH TERMS
# Organized by topic, with translations for each supported language
# Languages: en (English), fr (French), de (German), ru (Russian),
#            es (Spanish), it (Italian)
# ══════════════════════════════════════════════════════════════════════════════

SEARCH_TOPICS = {
    "calculating_machines": {
        "en": [
            "calculating machine",
            "difference engine",
            "analytical engine",
            "babbage",
            "arithmetic machine",
            "mechanical calculator",
        ],
        "fr": [
            "machine à calculer",
            "machine arithmétique",
            "pascaline",
            "calculateur mécanique",
        ],
        "de": [
            "Rechenmaschine",
            "Differenzmaschine",
            "mechanischer Rechner",
            "Leibniz Rechenmaschine",
        ],
        "ru": [
            "счётная машина",
            "арифмометр",
            "вычислительная машина",
        ],
        "es": [
            "máquina calculadora",
            "máquina aritmética",
            "calculadora mecánica",
        ],
        "it": [
            "macchina calcolatrice",
            "macchina aritmetica",
            "calcolatore meccanico",
        ],
    },
    "automata": {
        "en": [
            "automaton",
            "automata",
            "mechanical man",
            "mechanical chess",
            "android",
            "clockwork figure",
            "self-moving machine",
        ],
        "fr": [
            "automate",
            "automates",
            "homme mécanique",
            "canard de vaucanson",
            "androïde",
            "figure mécanique",
        ],
        "de": [
            "Automat",
            "Automaten",
            "mechanischer Mensch",
            "Schachtürke",
            "Androide",
            "Uhrwerk",
        ],
        "ru": [
            "автомат",
            "автоматон",
            "механический человек",
            "андроид",
        ],
        "es": [
            "autómata",
            "autómatas",
            "hombre mecánico",
            "androide",
            "figura mecánica",
        ],
        "it": [
            "automa",
            "automi",
            "uomo meccanico",
            "androide",
            "figura meccanica",
        ],
    },
    "thinking_machines": {
        "en": [
            "thinking machine",
            "mechanical brain",
            "machine intelligence",
            "artificial mind",
            "machine thought",
            "reasoning machine",
            "logic machine",
        ],
        "fr": [
            "machine pensante",
            "cerveau mécanique",
            "intelligence artificielle",
            "machine à raisonner",
            "machine logique",
        ],
        "de": [
            "Denkmaschine",
            "denkende Maschine",
            "mechanisches Gehirn",
            "künstliche Intelligenz",
            "Logikmaschine",
        ],
        "ru": [
            "мыслящая машина",
            "механический мозг",
            "искусственный интеллект",
            "логическая машина",
        ],
        "es": [
            "máquina pensante",
            "cerebro mecánico",
            "inteligencia artificial",
            "máquina de razonar",
        ],
        "it": [
            "macchina pensante",
            "cervello meccanico",
            "intelligenza artificiale",
            "macchina logica",
        ],
    },
    "computing": {
        "en": [
            "computing machine",
            "electronic brain",
            "digital computer",
            "turing machine",
            "stored program",
            "electronic computer",
            "information machine",
        ],
        "fr": [
            "machine à calculer électronique",
            "cerveau électronique",
            "ordinateur",
            "calculateur numérique",
        ],
        "de": [
            "Rechenanlage",
            "elektronisches Gehirn",
            "Digitalrechner",
            "Computer",
            "Zuse",
        ],
        "ru": [
            "электронно-вычислительная машина",
            "ЭВМ",
            "электронный мозг",
            "компьютер",
        ],
        "es": [
            "computadora",
            "ordenador",
            "cerebro electrónico",
            "máquina computadora",
        ],
        "it": [
            "calcolatore elettronico",
            "cervello elettronico",
            "elaboratore",
            "computer",
        ],
    },
    "cybernetics": {
        "en": [
            "cybernetics",
            "feedback control",
            "servomechanism",
            "norbert wiener",
            "self-regulating",
            "control system",
        ],
        "fr": [
            "cybernétique",
            "rétroaction",
            "servomécanisme",
            "système autorégulé",
        ],
        "de": [
            "Kybernetik",
            "Rückkopplung",
            "Regelungstechnik",
            "Servomechanismus",
        ],
        "ru": [
            "кибернетика",
            "обратная связь",
            "саморегуляция",
        ],
        "es": [
            "cibernética",
            "retroalimentación",
            "servomecanismo",
            "sistema de control",
        ],
        "it": [
            "cibernetica",
            "retroazione",
            "servomeccanismo",
            "sistema di controllo",
        ],
    },
    "automation": {
        "en": [
            "automation",
            "automatic control",
            "automatic factory",
            "robot",
            "robotics",
            "automatic machine",
        ],
        "fr": [
            "automatisation",
            "contrôle automatique",
            "robot",
            "robotique",
            "usine automatique",
        ],
        "de": [
            "Automatisierung",
            "automatische Steuerung",
            "Roboter",
            "Robotik",
            "automatische Fabrik",
        ],
        "ru": [
            "автоматизация",
            "автоматическое управление",
            "робот",
            "робототехника",
        ],
        "es": [
            "automatización",
            "control automático",
            "robot",
            "robótica",
            "fábrica automática",
        ],
        "it": [
            "automazione",
            "controllo automatico",
            "robot",
            "robotica",
            "fabbrica automatica",
        ],
    },
    "intelligence": {
        "en": [
            "intelligence",
            "intellect",
            "understanding",
            "reason",
            "cognition",
            "mental faculty",
            "mind",
        ],
        "fr": [
            "intelligence",
            "intellect",
            "entendement",
            "raison",
            "cognition",
            "esprit",
            "faculté mentale",
        ],
        "de": [
            "Intelligenz",
            "Verstand",
            "Vernunft",
            "Geist",
            "Erkenntnis",
            "Denkvermögen",
        ],
        "ru": [
            "интеллект",
            "разум",
            "рассудок",
            "познание",
            "ум",
        ],
        "es": [
            "inteligencia",
            "intelecto",
            "entendimiento",
            "razón",
            "cognición",
            "mente",
        ],
        "it": [
            "intelligenza",
            "intelletto",
            "intendimento",
            "ragione",
            "cognizione",
            "mente",
        ],
    },
    "learning": {
        "en": [
            "learning",
            "machine learning",
            "habit",
            "memory",
            "training",
            "instruction",
            "education of machines",
        ],
        "fr": [
            "apprentissage",
            "habitude",
            "mémoire",
            "instruction",
            "éducation",
            "entraînement",
        ],
        "de": [
            "Lernen",
            "maschinelles Lernen",
            "Gewohnheit",
            "Gedächtnis",
            "Training",
            "Erziehung",
        ],
        "ru": [
            "обучение",
            "машинное обучение",
            "привычка",
            "память",
            "тренировка",
        ],
        "es": [
            "aprendizaje",
            "hábito",
            "memoria",
            "entrenamiento",
            "instrucción",
        ],
        "it": [
            "apprendimento",
            "abitudine",
            "memoria",
            "addestramento",
            "istruzione",
        ],
    },
    "mechanism": {
        "en": [
            "mechanism",
            "mechanical philosophy",
            "clockwork universe",
            "machine",
            "engine",
            "mechanistic",
        ],
        "fr": [
            "mécanisme",
            "philosophie mécanique",
            "machine",
            "moteur",
            "horloge",
            "mécaniste",
        ],
        "de": [
            "Mechanismus",
            "mechanische Philosophie",
            "Maschine",
            "Uhrwerk",
            "Motor",
            "mechanistisch",
        ],
        "ru": [
            "механизм",
            "механическая философия",
            "машина",
            "двигатель",
            "часовой механизм",
        ],
        "es": [
            "mecanismo",
            "filosofía mecánica",
            "máquina",
            "motor",
            "relojería",
            "mecanicista",
        ],
        "it": [
            "meccanismo",
            "filosofia meccanica",
            "macchina",
            "motore",
            "orologeria",
            "meccanicistico",
        ],
    },
    "statistics_probability": {
        "en": [
            "statistics",
            "probability",
            "regression",
            "correlation",
            "distribution",
            "random",
            "chance",
            "stochastic",
        ],
        "fr": [
            "statistique",
            "probabilité",
            "régression",
            "corrélation",
            "distribution",
            "hasard",
            "aléatoire",
        ],
        "de": [
            "Statistik",
            "Wahrscheinlichkeit",
            "Regression",
            "Korrelation",
            "Verteilung",
            "Zufall",
            "stochastisch",
        ],
        "ru": [
            "статистика",
            "вероятность",
            "регрессия",
            "корреляция",
            "распределение",
            "случайность",
        ],
        "es": [
            "estadística",
            "probabilidad",
            "regresión",
            "correlación",
            "distribución",
            "azar",
            "aleatorio",
        ],
        "it": [
            "statistica",
            "probabilità",
            "regressione",
            "correlazione",
            "distribuzione",
            "caso",
            "aleatorio",
        ],
    },
}

# Supported languages with their Internet Archive language codes
LANGUAGES = {
    "en": "English",
    "fr": "French",
    "de": "German",
    "ru": "Russian",
    "es": "Spanish",
    "it": "Italian",
}

# Date range (expanded for GEMI project: 1600-2000)
START_YEAR = 1600
END_YEAR = 2000

# Output directory
CORPUS_DIR = Path("corpus")

# Rate limiting (be nice to IA servers)
REQUEST_DELAY = 1.0  # seconds between requests

# Maximum items per search term (to avoid overwhelming)
MAX_ITEMS_PER_TERM = 50


# ══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def setup_directories():
    """Create the corpus directory structure."""
    CORPUS_DIR.mkdir(exist_ok=True)
    (CORPUS_DIR / "by_decade").mkdir(exist_ok=True)
    (CORPUS_DIR / "by_topic").mkdir(exist_ok=True)
    (CORPUS_DIR / "by_language").mkdir(exist_ok=True)
    (CORPUS_DIR / "raw_texts").mkdir(exist_ok=True)

    # Create decade folders (1600s through 2000s)
    for decade in range(START_YEAR // 10 * 10, END_YEAR + 10, 10):
        (CORPUS_DIR / "by_decade" / f"{decade}s").mkdir(exist_ok=True)

    # Create topic folders
    for topic in SEARCH_TOPICS.keys():
        (CORPUS_DIR / "by_topic" / topic).mkdir(exist_ok=True)

    # Create language folders
    for lang_code in LANGUAGES.keys():
        (CORPUS_DIR / "by_language" / lang_code).mkdir(exist_ok=True)


def extract_year(date_str: Optional[str]) -> Optional[int]:
    """Extract year from various date formats."""
    if not date_str:
        return None

    # Try common patterns
    patterns = [
        r'(\d{4})',  # Just a year
        r'(\d{4})-\d{2}-\d{2}',  # ISO format
    ]

    for pattern in patterns:
        match = re.search(pattern, str(date_str))
        if match:
            year = int(match.group(1))
            if START_YEAR <= year <= END_YEAR:
                return year
    return None


def get_decade(year: int) -> str:
    """Get decade string from year."""
    return f"{(year // 10) * 10}s"


def get_ocr_text_url(identifier: str) -> Optional[str]:
    """Get the URL for OCR'd text file if available."""
    try:
        item = ia.get_item(identifier)
        files = list(item.get_files())

        # Prefer higher-quality OCR derivatives when available
        for f in files:
            if f.name.endswith('_abbyy.gz'):
                return f"https://archive.org/download/{identifier}/{f.name}"

        for f in files:
            if f.name.endswith('_hocr.html') or f.name.endswith('_hocr.htm'):
                return f"https://archive.org/download/{identifier}/{f.name}"

        for f in files:
            if f.name.endswith('_djvu.txt'):
                return f"https://archive.org/download/{identifier}/{f.name}"

        for f in files:
            if f.name.endswith('.txt') and 'ocr' in f.name.lower():
                return f"https://archive.org/download/{identifier}/{f.name}"

        return None
    except Exception as e:
        print(f"  Error getting files for {identifier}: {e}")
        return None


def download_text(url: str, identifier: str) -> Optional[str]:
    """Download text content from URL."""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        return response.text
    except Exception as e:
        print(f"  Error downloading {identifier}: {e}")
        return None


def clean_text(text: str) -> str:
    """
    Basic text cleaning that preserves multilingual characters.

    Keeps: Latin extended (French, German, Spanish, Italian accents),
           Cyrillic (Russian), common punctuation
    Removes: Control characters, excessive whitespace, common OCR noise
    """
    # Remove control characters except newlines and tabs
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

    # Remove excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    text = re.sub(r'\t+', ' ', text)

    # Remove common OCR artifacts (isolated punctuation, repeated special chars)
    text = re.sub(r'[|]{2,}', '', text)  # Repeated pipes
    text = re.sub(r'[_]{3,}', '', text)  # Long underscores
    text = re.sub(r'[~]{2,}', '', text)  # Repeated tildes

    return text.strip()


def save_text(text: str, identifier: str, year: int, topic: str, language: str, metadata: dict):
    """Save text to appropriate locations with organization by decade, topic, and language."""
    # Clean filename
    safe_id = re.sub(r'[^\w\-]', '_', identifier)
    filename = f"{year}_{language}_{safe_id}.txt"

    # Save to raw_texts
    raw_path = CORPUS_DIR / "raw_texts" / filename
    raw_path.write_text(text, encoding='utf-8')

    # Create symlinks for organization
    decade = get_decade(year)
    decade_link = CORPUS_DIR / "by_decade" / decade / filename
    topic_link = CORPUS_DIR / "by_topic" / topic / filename
    lang_link = CORPUS_DIR / "by_language" / language / filename

    # Use relative symlinks
    try:
        if not decade_link.exists():
            decade_link.symlink_to(f"../../raw_texts/{filename}")
        if not topic_link.exists():
            topic_link.symlink_to(f"../../raw_texts/{filename}")
        if not lang_link.exists():
            lang_link.symlink_to(f"../../raw_texts/{filename}")
    except OSError:
        # Windows doesn't always support symlinks, just copy
        if not decade_link.exists():
            decade_link.write_text(text, encoding='utf-8')
        if not topic_link.exists():
            topic_link.write_text(text, encoding='utf-8')
        if not lang_link.exists():
            lang_link.write_text(text, encoding='utf-8')

    return str(raw_path)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN SEARCH AND DOWNLOAD
# ══════════════════════════════════════════════════════════════════════════════

def search_and_download(languages_to_search: list[str] = None, topics_to_search: list[str] = None):
    """
    Main function to search IA and download texts.

    Args:
        languages_to_search: List of language codes to search (default: all)
        topics_to_search: List of topic names to search (default: all)
    """
    setup_directories()

    # Default to all languages and topics
    if languages_to_search is None:
        languages_to_search = list(LANGUAGES.keys())
    if topics_to_search is None:
        topics_to_search = list(SEARCH_TOPICS.keys())

    # Track what we've downloaded (avoid duplicates)
    downloaded = set()
    metadata_index = []

    # Load existing metadata if resuming
    metadata_file = CORPUS_DIR / "metadata.json"
    if metadata_file.exists():
        with open(metadata_file) as f:
            metadata_index = json.load(f)
            downloaded = {item['identifier'] for item in metadata_index}
        print(f"Resuming: {len(downloaded)} items already downloaded")

    total_downloaded = len(downloaded)

    for topic in topics_to_search:
        if topic not in SEARCH_TOPICS:
            print(f"Warning: Unknown topic '{topic}', skipping")
            continue

        topic_terms = SEARCH_TOPICS[topic]

        print(f"\n{'='*70}")
        print(f"TOPIC: {topic}")
        print('='*70)

        for lang_code in languages_to_search:
            if lang_code not in topic_terms:
                continue

            lang_name = LANGUAGES.get(lang_code, lang_code)
            search_terms = topic_terms[lang_code]

            print(f"\n  Language: {lang_name} ({lang_code})")
            print(f"  {'-'*50}")

            for term in search_terms:
                print(f"\n    Searching: '{term}'")

                # Build search query with language filter
                # Note: IA language field uses full names like "English", "French", etc.
                query = f'"{term}" AND date:[{START_YEAR}-01-01 TO {END_YEAR}-12-31] AND mediatype:(texts)'

                # Add language filter if not English (English is default/most common)
                if lang_code != "en":
                    query += f' AND language:({lang_name})'

                try:
                    search_results = ia.search_items(
                        query,
                        fields=['identifier', 'title', 'date', 'creator', 'description', 'subject', 'language'],
                        sorts=['date asc']
                    )

                    count = 0
                    for result in search_results:
                        if count >= MAX_ITEMS_PER_TERM:
                            print(f"      Reached limit of {MAX_ITEMS_PER_TERM} items for this term")
                            break

                        identifier = result.get('identifier')

                        # Skip if already downloaded
                        if identifier in downloaded:
                            continue

                        title = result.get('title', 'Unknown')
                        date = result.get('date')
                        year = extract_year(date)

                        if not year:
                            continue

                        print(f"      [{year}] {title[:50]}...")

                        # Get OCR text URL
                        text_url = get_ocr_text_url(identifier)
                        if not text_url:
                            print(f"        No OCR text available, skipping")
                            continue

                        # Download text
                        text = download_text(text_url, identifier)
                        if not text or len(text) < 500:
                            print(f"        Text too short or empty, skipping")
                            continue

                        # Clean and save
                        text = clean_text(text)

                        # Detect actual language from IA metadata if available
                        detected_lang = result.get('language', lang_name)
                        if isinstance(detected_lang, list):
                            detected_lang = detected_lang[0] if detected_lang else lang_name

                        item_metadata = {
                            'identifier': identifier,
                            'title': title,
                            'year': year,
                            'date': date,
                            'creator': result.get('creator'),
                            'description': result.get('description', '')[:500] if result.get('description') else None,
                            'subject': result.get('subject'),
                            'topic': topic,
                            'search_term': term,
                            'language_code': lang_code,
                            'language': detected_lang,
                            'source_url': f"https://archive.org/details/{identifier}",
                            'text_url': text_url,
                            'char_count': len(text),
                            'downloaded_at': datetime.now().isoformat(),
                        }

                        filepath = save_text(text, identifier, year, topic, lang_code, item_metadata)
                        item_metadata['local_path'] = filepath

                        metadata_index.append(item_metadata)
                        downloaded.add(identifier)
                        total_downloaded += 1
                        count += 1

                        print(f"        ✓ Saved ({len(text):,} chars)")

                        # Save metadata periodically
                        if total_downloaded % 10 == 0:
                            with open(metadata_file, 'w') as f:
                                json.dump(metadata_index, f, indent=2)

                        # Rate limiting
                        time.sleep(REQUEST_DELAY)

                except Exception as e:
                    print(f"      Error searching for '{term}': {e}")
                    continue

    # Final save
    with open(metadata_file, 'w') as f:
        json.dump(metadata_index, f, indent=2)

    print(f"\n{'='*70}")
    print(f"COMPLETE: Downloaded {total_downloaded} items")
    print(f"Corpus saved to: {CORPUS_DIR.absolute()}")
    print(f"Metadata index: {metadata_file}")
    print('='*70)

    # Print summary by decade
    print("\nItems by decade:")
    decade_counts = {}
    for item in metadata_index:
        decade = get_decade(item['year'])
        decade_counts[decade] = decade_counts.get(decade, 0) + 1
    for decade in sorted(decade_counts.keys()):
        print(f"  {decade}: {decade_counts[decade]}")

    # Print summary by topic
    print("\nItems by topic:")
    topic_counts = {}
    for item in metadata_index:
        topic = item['topic']
        topic_counts[topic] = topic_counts.get(topic, 0) + 1
    for topic, count in sorted(topic_counts.items(), key=lambda x: -x[1]):
        print(f"  {topic}: {count}")

    # Print summary by language
    print("\nItems by language:")
    lang_counts = {}
    for item in metadata_index:
        lang = item.get('language_code', 'unknown')
        lang_counts[lang] = lang_counts.get(lang, 0) + 1
    for lang, count in sorted(lang_counts.items(), key=lambda x: -x[1]):
        lang_name = LANGUAGES.get(lang, lang)
        print(f"  {lang_name} ({lang}): {count}")


def print_corpus_stats():
    """Print statistics about the existing corpus."""
    metadata_file = CORPUS_DIR / "metadata.json"
    if not metadata_file.exists():
        print("No corpus found. Run without --stats to build one.")
        return

    with open(metadata_file) as f:
        metadata = json.load(f)

    print(f"\nCorpus Statistics")
    print(f"{'='*50}")
    print(f"Total documents: {len(metadata)}")

    # By decade
    print(f"\nBy decade:")
    decade_counts = {}
    for item in metadata:
        decade = get_decade(item['year'])
        decade_counts[decade] = decade_counts.get(decade, 0) + 1
    for decade in sorted(decade_counts.keys()):
        print(f"  {decade}: {decade_counts[decade]}")

    # By language
    print(f"\nBy language:")
    lang_counts = {}
    for item in metadata:
        lang = item.get('language_code', 'unknown')
        lang_counts[lang] = lang_counts.get(lang, 0) + 1
    for lang, count in sorted(lang_counts.items(), key=lambda x: -x[1]):
        lang_name = LANGUAGES.get(lang, lang)
        print(f"  {lang_name}: {count}")

    # By topic
    print(f"\nBy topic:")
    topic_counts = {}
    for item in metadata:
        topic = item['topic']
        topic_counts[topic] = topic_counts.get(topic, 0) + 1
    for topic, count in sorted(topic_counts.items(), key=lambda x: -x[1]):
        print(f"  {topic}: {count}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="GEMI Corpus Builder - Download historical texts from Internet Archive",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python ia_historical_corpus.py                    # Download all languages and topics
  python ia_historical_corpus.py -l en fr          # English and French only
  python ia_historical_corpus.py -t automata       # Single topic only
  python ia_historical_corpus.py -l de -t mechanism computing  # German texts on mechanism and computing
  python ia_historical_corpus.py --stats           # Show corpus statistics
  python ia_historical_corpus.py --list            # List available topics and languages
        """
    )

    parser.add_argument(
        '-l', '--languages',
        nargs='+',
        choices=list(LANGUAGES.keys()),
        help=f"Languages to search (default: all). Choices: {', '.join(LANGUAGES.keys())}"
    )

    parser.add_argument(
        '-t', '--topics',
        nargs='+',
        choices=list(SEARCH_TOPICS.keys()),
        help="Topics to search (default: all)"
    )

    parser.add_argument(
        '--stats',
        action='store_true',
        help="Show statistics about existing corpus"
    )

    parser.add_argument(
        '--list',
        action='store_true',
        help="List all available topics and languages"
    )

    parser.add_argument(
        '--max-per-term',
        type=int,
        default=MAX_ITEMS_PER_TERM,
        help=f"Maximum items to download per search term (default: {MAX_ITEMS_PER_TERM})"
    )

    args = parser.parse_args()

    if args.list:
        print("\nAvailable Languages:")
        for code, name in LANGUAGES.items():
            print(f"  {code}: {name}")

        print("\nAvailable Topics:")
        for topic, terms in SEARCH_TOPICS.items():
            langs_available = [l for l in terms.keys() if l in LANGUAGES]
            print(f"  {topic} ({', '.join(langs_available)})")
        exit(0)

    if args.stats:
        print_corpus_stats()
        exit(0)

    # Update max items if specified
    if args.max_per_term != MAX_ITEMS_PER_TERM:
        globals()['MAX_ITEMS_PER_TERM'] = args.max_per_term

    print("="*70)
    print("GEMI CORPUS BUILDER")
    print("Genealogies of Engines, Machines, and Intelligences")
    print("="*70)
    print(f"\nDate range: {START_YEAR}-{END_YEAR}")

    langs = args.languages or list(LANGUAGES.keys())
    topics = args.topics or list(SEARCH_TOPICS.keys())

    print(f"Languages: {', '.join(LANGUAGES[l] for l in langs)}")
    print(f"Topics: {', '.join(topics)}")
    print(f"Max items per search term: {args.max_per_term}")
    print()

    search_and_download(languages_to_search=langs, topics_to_search=topics)
