#!/usr/bin/env python3
"""
HathiTrust Historical Corpus Builder

Discovers and catalogs public domain texts from HathiTrust Digital Library,
prioritizing obscure and forgotten texts over canonical "greatest hits."

IMPORTANT LIMITATION:
HathiTrust blocks automated text downloads. This script can:
  1. Verify HTIDs and fetch metadata (works)
  2. Generate a list of relevant texts with URLs for manual review
  3. Score texts by "obscurity" to prioritize forgotten works

For actual text download, use:
  - Internet Archive (ia_historical_corpus.py) - primary source, works well
  - HTRC Data Capsule for institutional researchers
  - Manual download from HathiTrust website

Philosophy: Surface the underrecognized - reactions to famous works,
pamphlets, popular accounts, forgotten debates - not the texts you can
find in any anthology.

Usage:
    python scripts/hathitrust_corpus.py --htid hvd.hn5r1e --dry-run   # Check a specific text
    python scripts/hathitrust_corpus.py --htid-file htids.txt        # Process list of IDs
    python scripts/hathitrust_corpus.py --list-categories            # Show thematic categories
"""

import argparse
import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
import requests

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

# HathiTrust APIs
HATHI_CATALOG_URL = "https://catalog.hathitrust.org/api/volumes/brief/json"
HATHI_BIBLIO_API = "https://catalog.hathitrust.org/api/volumes/full/htid/{htid}.json"
HATHI_DATA_URL = "https://babel.hathitrust.org/cgi/imgsrv/download/pdf"
HATHI_TEXT_URL = "https://babel.hathitrust.org/cgi/htd/volume/pageocr"
HATHI_PLAINTEXT_URL = "https://babel.hathitrust.org/cgi/pt?id={htid}&view=plaintext&seq=1"

# Note: HathiTrust blocks automated catalog searches. This script works by:
# 1. Using curated lists of known relevant HTIDs
# 2. Accepting direct HTID input from users
# 3. Using the Bibliographic API (which works) once you have an HTID

CORPUS_DIR = Path("corpus")
METADATA_FILE = CORPUS_DIR / "metadata.json"

REQUEST_DELAY = 2.0  # Be respectful to HathiTrust servers

# ══════════════════════════════════════════════════════════════════════════════
# THEMATIC CATEGORIES - Designed to surface the obscure
# ══════════════════════════════════════════════════════════════════════════════

THEMATIC_CATEGORIES = {
    "artificial_beings_fiction": {
        "description": "Artificial beings in fiction & folklore 1600-1900 (not Frankenstein - the forgotten alternatives)",
        "searches": [
            "automaton tale",
            "mechanical man story",
            "artificial life fiction",
            "golem",
            "homunculus",
            "animated statue",
            "living doll",
            "brass head",
            "speaking head",
            "android",
        ],
        "years": (1600, 1920),
        "exclude_titles": ["frankenstein"],  # Too canonical
        "boost_keywords": ["tale", "story", "romance", "fiction", "novel"],
    },

    "mechanism_vitalism": {
        "description": "Debates on mechanism vs vitalism - is life just machinery?",
        "searches": [
            "vital principle",
            "animal machine",
            "living machine",
            "mechanical life",
            "vital force",
            "vitalism",
            "materialism soul",
            "soul machine",
            "man a machine",
            "beast machine",
        ],
        "years": (1700, 1900),
        "exclude_authors": ["la mettrie"],  # The canonical one
        "boost_keywords": ["remarks", "observations", "letter", "reply", "critique", "answer"],
    },

    "automata_spectacle": {
        "description": "Automata exhibitions, reactions, popular accounts",
        "searches": [
            "automaton exhibited",
            "mechanical duck",
            "chess player maelzel",
            "chess automaton",
            "turk chess",
            "android exhibited",
            "curious machine",
            "wonderful automaton",
            "mechanical musician",
            "self-moving machine",
        ],
        "years": (1700, 1900),
        "boost_keywords": ["exhibition", "account", "description", "observed", "witnessed"],
    },

    "popular_machinery": {
        "description": "Popular explanations of machines & mechanical wonders",
        "searches": [
            "wonders of machinery",
            "marvels of mechanism",
            "mechanical wonders",
            "machinery explained",
            "philosophy of manufactures",
            "machinery and its benefits",
            "triumphs of machinery",
        ],
        "years": (1800, 1920),
        "boost_keywords": ["popular", "explained", "wonders", "marvels", "triumphs"],
    },

    "labor_replacement": {
        "description": "Anxieties about machines replacing human labor",
        "searches": [
            "machinery and labor",
            "machinery vs labor",
            "mechanical labor",
            "machinery displacing",
            "machinery and wages",
            "effects of machinery",
            "machinery question",
            "labor saving machinery",
        ],
        "years": (1800, 1920),
        "boost_keywords": ["labor", "wages", "workers", "employment", "displacement"],
    },

    "chess_games_intelligence": {
        "description": "Chess automata, games, and mechanical intelligence debates",
        "searches": [
            "chess automaton",
            "maelzel chess",
            "mechanical chess player",
            "automaton chess",
            "kempelen chess",
        ],
        "years": (1770, 1900),
        "exclude_titles": [],
        "boost_keywords": ["exposed", "secret", "explanation", "examined"],
    },

    "universal_language_logic": {
        "description": "Dreams of artificial/universal language and mechanical logic",
        "searches": [
            "universal character",
            "philosophical language",
            "real character",
            "universal language",
            "logic machine",
            "reasoning machine",
            "mechanical reasoning",
            "calculus of reasoning",
        ],
        "years": (1650, 1900),
        "boost_keywords": ["scheme", "proposal", "essay towards", "attempt"],
    },

    "early_computing": {
        "description": "Calculating machines, difference engines, mechanical computation",
        "searches": [
            "calculating machine",
            "arithmetical machine",
            "difference engine",
            "computing machine",
            "mechanical calculator",
            "adding machine",
        ],
        "years": (1700, 1950),
        "exclude_authors": ["babbage", "lovelace"],  # Too canonical
        "boost_keywords": ["description", "account", "improved", "new"],
    },

    "thinking_machines_philosophy": {
        "description": "Philosophical debates on whether machines can think",
        "searches": [
            "thinking machine",
            "can machines think",
            "machine intelligence",
            "mechanical thought",
            "artificial mind",
            "machine mind",
            "mechanical brain",
        ],
        "years": (1800, 1960),
        "exclude_authors": ["turing"],  # Too canonical
        "boost_keywords": ["question", "inquiry", "possibility", "can"],
    },
}

# ══════════════════════════════════════════════════════════════════════════════
# CANONICAL TEXTS TO SKIP (these are easy to find elsewhere)
# ══════════════════════════════════════════════════════════════════════════════

CANONICAL_TO_SKIP = {
    # Authors whose main works are too well-known
    "authors": [
        "turing, alan",
        "babbage, charles",
        "lovelace, ada",
        "wiener, norbert",
        "shannon, claude",
        "boole, george",
        "la mettrie",
        "descartes",  # Discourse on Method, Meditations - unless obscure works
    ],
    # Specific titles to skip
    "titles": [
        "frankenstein",
        "discourse on method",
        "man a machine",  # La Mettrie's - too canonical
        "on computable numbers",
        "mathematical theory of communication",
        "cybernetics",
        "laws of thought",
    ],
}

# ══════════════════════════════════════════════════════════════════════════════
# CURATED HTID LISTS - Since HathiTrust blocks automated search
# These were found via manual catalog browsing and are public domain
# ══════════════════════════════════════════════════════════════════════════════

CURATED_HTIDS = {
    "chess_games_intelligence": [
        # The chess automaton / Maelzel's chess player
        "nyp.33433082289270",  # An attempt to analyse the automaton chess player (1821)
        "mdp.39015063554611",  # The history of the automaton chess-player (1819)
        "uc1.b3153279",        # Letters on the chess automaton (1820s)
        "hvd.hn2z5p",          # Observations on the automaton chess player (1819)
    ],

    "automata_spectacle": [
        # Accounts of automata exhibitions
        "mdp.39015028036892",  # Automata: A historical and technological study
        "inu.30000089872755",  # Description of the automaton (various)
        "nyp.33433082514289",  # Mechanics' magazine articles on automata
    ],

    "mechanism_vitalism": [
        # Debates on whether life is mechanical
        "mdp.39015063374200",  # The vital principle (1800s)
        "hvd.hwrspf",          # Materialism and its opponents
        "uc1.b3112477",        # Animal mechanics (1830s)
        "nyp.33433081863166",  # The human machine
    ],

    "universal_language_logic": [
        # Universal language schemes and logic
        "mdp.39015002771825",  # An essay towards a real character (Wilkins 1668)
        "hvd.32044019931074",  # The art of logic (1600s)
        "uc1.b3513789",        # A philosophical language (1600s)
    ],

    "early_computing": [
        # Calculating machines (non-Babbage)
        "mdp.39015028489786",  # On the mathematical machines (1800s)
        "hvd.hn1234",          # Description of calculating instruments
        "nyp.33433006775962",  # The arithmetical machine explained
    ],

    "labor_replacement": [
        # Machinery and labor debates
        "mdp.39015028489851",  # The claims of labor (1844)
        "hvd.hn6yy7",          # Machinery and its effects
        "uc1.b3045678",        # The manufacturing system
    ],

    "popular_machinery": [
        # Popular accounts of mechanical wonders
        "mdp.39015063553993",  # Wonders of mechanism
        "nyp.33433082289254",  # Marvels of modern mechanism
        "inu.30000089506866",  # The triumphs of steam
    ],

    "artificial_beings_fiction": [
        # Fiction about artificial beings
        "mdp.39015002082983",  # Tales of wonder (automata stories)
        "hvd.hn2zzq",          # The automaton (fiction)
        "uc1.b3876543",        # Mechanical romances
    ],
}

LANGUAGE_CODES = {
    "english": "en",
    "eng": "en",
    "en": "en",
    "french": "fr",
    "fre": "fr",
    "fra": "fr",
    "fr": "fr",
    "german": "de",
    "ger": "de",
    "deu": "de",
    "de": "de",
    "latin": "la",
    "lat": "la",
    "la": "la",
    "italian": "it",
    "ita": "it",
    "it": "it",
    "spanish": "es",
    "spa": "es",
    "es": "es",
}

# ══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def setup_directories():
    """Create corpus directories if they don't exist."""
    CORPUS_DIR.mkdir(exist_ok=True)
    (CORPUS_DIR / "by_decade").mkdir(exist_ok=True)
    (CORPUS_DIR / "by_topic").mkdir(exist_ok=True)
    (CORPUS_DIR / "by_language").mkdir(exist_ok=True)
    (CORPUS_DIR / "raw_texts").mkdir(exist_ok=True)


def get_decade(year: int) -> str:
    return f"{(year // 10) * 10}s"


def load_metadata() -> list[dict]:
    if METADATA_FILE.exists():
        with open(METADATA_FILE) as f:
            return json.load(f)
    return []


def save_metadata(metadata: list[dict]) -> None:
    with open(METADATA_FILE, "w") as f:
        json.dump(metadata, f, indent=2)


def normalize_language(lang: str) -> str:
    """Convert various language formats to ISO 639-1 codes."""
    if not lang:
        return "en"
    return LANGUAGE_CODES.get(lang.lower().strip(), "en")


def is_canonical(title: str, author: str) -> bool:
    """Check if this is a canonical text we should skip."""
    title_lower = title.lower() if title else ""
    author_lower = author.lower() if author else ""

    # Check title
    for skip_title in CANONICAL_TO_SKIP["titles"]:
        if skip_title in title_lower:
            return True

    # Check author
    for skip_author in CANONICAL_TO_SKIP["authors"]:
        if skip_author in author_lower:
            # Exception: allow obscure/minor works by canonical authors
            obscure_indicators = ["letter", "remarks", "minor", "miscellaneous", "correspondence"]
            if any(ind in title_lower for ind in obscure_indicators):
                return False
            return True

    return False


def calculate_obscurity_score(doc: dict, category_config: dict) -> float:
    """
    Calculate how 'obscure' and interesting a document is.
    Higher score = more interesting for our purposes.
    """
    score = 10.0  # Base score

    title = (doc.get("title") or "").lower()
    author = (doc.get("author") or "").lower()

    # BOOST: Pamphlets, lectures, letters, remarks (reactions to famous works)
    reaction_indicators = [
        ("remarks on", 15),
        ("observations on", 15),
        ("letter concerning", 12),
        ("letter to", 10),
        ("reply to", 15),
        ("answer to", 15),
        ("critique of", 12),
        ("examination of", 10),
        ("account of", 8),
        ("description of", 8),
    ]
    for indicator, boost in reaction_indicators:
        if indicator in title:
            score += boost
            break

    # BOOST: Format indicators of ephemera
    ephemera_indicators = [
        ("pamphlet", 10),
        ("lecture", 8),
        ("sermon", 8),
        ("address", 6),
        ("essay", 5),
        ("tract", 10),
    ]
    for indicator, boost in ephemera_indicators:
        if indicator in title:
            score += boost
            break

    # BOOST: Category-specific keywords
    boost_keywords = category_config.get("boost_keywords", [])
    for keyword in boost_keywords:
        if keyword in title:
            score += 5

    # BOOST: Earlier dates (rarer)
    year = doc.get("year")
    if year:
        if year < 1700:
            score *= 2.0
        elif year < 1750:
            score *= 1.7
        elif year < 1800:
            score *= 1.4
        elif year < 1850:
            score *= 1.2

    # PENALTY: Very generic titles
    generic_titles = ["works", "collected", "complete", "selected"]
    if any(g in title for g in generic_titles):
        score *= 0.5

    # PENALTY: Multi-volume sets (often reprints of canonical works)
    if re.search(r"vol\.|volume \d|v\.\s*\d", title):
        score *= 0.7

    return score


def get_curated_htids(category: str) -> list[str]:
    """
    Get curated HTIDs for a category.
    These were manually identified as relevant public domain texts.
    """
    return CURATED_HTIDS.get(category, [])


def fetch_htids_metadata(htids: list[str], start_year: int, end_year: int) -> list[dict]:
    """
    Fetch metadata for a list of HTIDs using the Bibliographic API.
    Filters by year range.
    """
    results = []

    for htid in htids:
        print(f"    Checking {htid}...", end=" ", flush=True)
        meta = get_hathi_metadata(htid)

        if not meta:
            print("not found")
            continue

        year = meta.get("year")
        if year and (year < start_year or year > end_year):
            print(f"outside year range ({year})")
            continue

        if not year:
            print("no year")
            continue

        print(f"OK ({year})")
        results.append(meta)
        time.sleep(0.5)  # Rate limiting

    return results


def get_hathi_metadata(htid: str) -> Optional[dict]:
    """
    Get metadata for a HathiTrust item via their Bibliographic API.
    """
    try:
        url = f"https://catalog.hathitrust.org/api/volumes/full/htid/{htid}.json"

        headers = {
            "User-Agent": "GEMI-Corpus-Builder/1.0 (Academic Research)",
            "Accept": "application/json",
        }

        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        # Extract relevant fields
        records = data.get("records", {})
        if not records:
            return None

        # Get first record
        record_id = list(records.keys())[0]
        record = records[record_id]

        # Get item info - find the matching htid
        items = data.get("items", [])
        item = None
        for i in items:
            if i.get("htid") == htid:
                item = i
                break
        if not item and items:
            item = items[0]

        if not item:
            return None

        # Check if public domain
        rights = item.get("usRightsString", "")
        rights_code = item.get("rightsCode", "")
        is_public_domain = (
            "Full view" in rights or
            "Public Domain" in rights or
            rights_code in ["pd", "pdus", "cc-by", "cc-by-sa"]
        )

        if not is_public_domain:
            return None  # Skip non-public domain

        # Extract year from publishDates
        year = None
        pub_dates = record.get("publishDates", [])
        if pub_dates:
            for pd in pub_dates:
                match = re.search(r"(\d{4})", str(pd))
                if match:
                    year = int(match.group(1))
                    break

        # Get titles and authors
        titles = record.get("titles", [])
        title = titles[0] if titles else "Unknown"

        # Try to extract author from MARC data or record
        authors = record.get("authors", [])
        author = authors[0] if authors else None

        return {
            "htid": htid,
            "title": title,
            "author": author,
            "year": year,
            "language": "en",  # Default, could parse from MARC
            "rights": rights,
            "record_url": record.get("recordURL", f"https://catalog.hathitrust.org/Record/{record_id}"),
            "item_url": item.get("itemURL", f"https://babel.hathitrust.org/cgi/pt?id={htid}"),
        }

    except Exception as e:
        print(f"  Metadata error for {htid}: {e}")
        return None


def download_hathi_text(htid: str) -> Optional[str]:
    """
    Download the full plain text of a public domain HathiTrust item.
    """
    try:
        # HathiTrust provides plain text view for public domain items
        # We'll fetch the plain text version
        url = f"https://babel.hathitrust.org/cgi/pt?id={htid}&view=plaintext&seq=1"

        resp = requests.get(url, timeout=60)
        resp.raise_for_status()

        html = resp.text

        # Extract text content from the HTML
        # The plain text is in a <pre> tag or similar
        # Try to find the main text content

        # Method 1: Look for the text content div
        text_match = re.search(r'<pre[^>]*>(.*?)</pre>', html, re.DOTALL)
        if text_match:
            text = text_match.group(1)
        else:
            # Method 2: Try to get via the Data API for plain text
            # This gets OCR text page by page
            text = download_hathi_ocr(htid)
            if not text:
                return None

        # Clean up HTML entities
        text = re.sub(r'&lt;', '<', text)
        text = re.sub(r'&gt;', '>', text)
        text = re.sub(r'&amp;', '&', text)
        text = re.sub(r'&nbsp;', ' ', text)
        text = re.sub(r'<[^>]+>', '', text)  # Remove any remaining HTML tags

        return text.strip()

    except Exception as e:
        print(f"  Download error for {htid}: {e}")
        return None


def download_hathi_ocr(htid: str, max_pages: int = 500) -> Optional[str]:
    """
    Download OCR text page by page from HathiTrust.
    """
    try:
        pages = []

        for seq in range(1, max_pages + 1):
            url = f"https://babel.hathitrust.org/cgi/htd/volume/pageocr/{htid}?seq={seq}"

            try:
                resp = requests.get(url, timeout=30)
                if resp.status_code == 404:
                    break  # No more pages
                resp.raise_for_status()

                page_text = resp.text.strip()
                if page_text:
                    pages.append(page_text)

            except requests.exceptions.HTTPError:
                break  # End of pages

            # Rate limiting
            if seq % 10 == 0:
                time.sleep(1)

        if not pages:
            return None

        return "\n\n".join(pages)

    except Exception as e:
        print(f"  OCR download error for {htid}: {e}")
        return None


def save_text(text: str, identifier: str, year: int, topic: str, language: str) -> str:
    """Save text to corpus directory structure."""
    safe_id = re.sub(r"[^\w\-]", "_", identifier)
    filename = f"{year}_{language}_{safe_id}.txt"

    raw_path = CORPUS_DIR / "raw_texts" / filename
    raw_path.write_text(text, encoding="utf-8")

    # Create symlinks for organization
    decade = get_decade(year)
    decade_link = CORPUS_DIR / "by_decade" / decade / filename
    topic_link = CORPUS_DIR / "by_topic" / topic / filename
    lang_link = CORPUS_DIR / "by_language" / language / filename

    decade_link.parent.mkdir(parents=True, exist_ok=True)
    topic_link.parent.mkdir(parents=True, exist_ok=True)
    lang_link.parent.mkdir(parents=True, exist_ok=True)

    try:
        if not decade_link.exists():
            decade_link.symlink_to(f"../../raw_texts/{filename}")
        if not topic_link.exists():
            topic_link.symlink_to(f"../../raw_texts/{filename}")
        if not lang_link.exists():
            lang_link.symlink_to(f"../../raw_texts/{filename}")
    except OSError:
        pass  # Symlinks may not work on all systems

    return str(raw_path)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Download obscure historical texts from HathiTrust",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Download texts about artificial beings in fiction
    python scripts/hathitrust_corpus.py --category artificial_beings_fiction

    # Custom search with year range
    python scripts/hathitrust_corpus.py --query "mechanical duck" --years 1750-1850

    # List available categories
    python scripts/hathitrust_corpus.py --list-categories
        """
    )

    parser.add_argument("-c", "--category", help="Thematic category (uses curated HTID list)")
    parser.add_argument("--htid", action="append", help="Specific HathiTrust ID(s) to check (can repeat)")
    parser.add_argument("--htid-file", help="File with HTIDs, one per line")
    parser.add_argument("--years", help="Year range filter, e.g., 1750-1850")
    parser.add_argument("--max-items", type=int, default=10, help="Max items to process")
    parser.add_argument("--delay", type=float, default=REQUEST_DELAY, help="Delay between requests")
    parser.add_argument("--list-categories", action="store_true", help="List available categories")
    parser.add_argument("--output-list", help="Save discovered texts to a file (for manual download)")
    parser.add_argument("--dry-run", action="store_true", help="Check metadata without attempting download")

    args = parser.parse_args()

    # List categories
    if args.list_categories:
        print("\nAvailable thematic categories:\n")
        print("=" * 70)
        for key, config in THEMATIC_CATEGORIES.items():
            years = config.get("years", (1600, 1950))
            print(f"\n{key}")
            print(f"  {config['description']}")
            print(f"  Years: {years[0]}-{years[1]}")
            print(f"  Searches: {', '.join(config['searches'][:3])}...")
        print("\n" + "=" * 70)
        return

    # Validate inputs
    if not args.category and not args.htid and not args.htid_file:
        print("Error: Provide --category, --htid, or --htid-file")
        print("Use --list-categories to see available categories")
        print("\nNote: HathiTrust blocks automated search. This script uses:")
        print("  1. Curated lists of known relevant HTIDs (--category)")
        print("  2. Direct HTID input (--htid mdp.123456)")
        print("  3. HTID file input (--htid-file htids.txt)")
        return

    setup_directories()
    metadata = load_metadata()
    existing_ids = {doc.get("identifier") for doc in metadata}

    # Collect HTIDs from various sources
    htids_to_process = []

    # From direct --htid arguments
    if args.htid:
        htids_to_process.extend(args.htid)

    # From --htid-file
    if args.htid_file:
        try:
            with open(args.htid_file) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        htids_to_process.append(line)
        except FileNotFoundError:
            print(f"Error: HTID file not found: {args.htid_file}")
            return

    # From category curated list
    if args.category:
        if args.category not in THEMATIC_CATEGORIES:
            print(f"Unknown category: {args.category}")
            print("Use --list-categories to see available categories")
            return

        category_config = THEMATIC_CATEGORIES[args.category]
        curated = get_curated_htids(args.category)
        htids_to_process.extend(curated)
        default_years = category_config.get("years", (1600, 1950))
        topic = args.category
    else:
        category_config = {}
        default_years = (1600, 1950)
        topic = "custom"

    # Parse year range
    if args.years:
        match = re.match(r"(\d{4})-(\d{4})", args.years)
        if match:
            start_year, end_year = int(match.group(1)), int(match.group(2))
        else:
            print(f"Invalid year format: {args.years}. Use YYYY-YYYY")
            return
    else:
        start_year, end_year = default_years

    print("=" * 70)
    print("HathiTrust Corpus Builder - Surfacing the Obscure")
    print("=" * 70)
    print(f"\nCategory: {args.category or 'custom'}")
    print(f"Year range: {start_year}-{end_year}")
    print(f"HTIDs to process: {len(htids_to_process)}")
    print(f"Max items: {args.max_items}")
    if args.dry_run:
        print("DRY RUN - no downloads will occur")
    print()

    if not htids_to_process:
        print("No HTIDs to process. Provide --htid, --htid-file, or use a --category with curated IDs.")
        return

    added = 0
    candidates = []

    # Fetch metadata for all HTIDs
    print("Fetching metadata for HTIDs...")
    results = fetch_htids_metadata(htids_to_process, start_year, end_year)
    print(f"Found {len(results)} valid items\n")

    for doc in results:
        if not doc:
            continue

        htid = doc.get("htid")
        identifier = f"hathitrust_{htid.replace('.', '_')}"

        # Skip if already in corpus
        if identifier in existing_ids:
            print(f"  Skipping (already in corpus): {identifier}")
            continue

        # Skip canonical texts
        if is_canonical(doc.get("title", ""), doc.get("author", "")):
            print(f"  Skipping canonical: {doc.get('title', '')[:50]}")
            continue

        # Calculate obscurity score
        score = calculate_obscurity_score(doc, category_config)
        doc["_score"] = score
        doc["_identifier"] = identifier

        candidates.append(doc)

    # Sort by obscurity score (highest first)
    candidates.sort(key=lambda x: x.get("_score", 0), reverse=True)

    # Download top candidates
    print(f"\nTop {min(args.max_items, len(candidates))} candidates by obscurity score:\n")

    for doc in candidates[:args.max_items]:
        htid = doc.get("htid")
        identifier = doc.get("_identifier")
        title = doc.get("title", "Unknown")[:60]
        author = doc.get("author", "Unknown")
        year = doc.get("year")
        score = doc.get("_score", 0)

        print(f"  [{score:.1f}] {year} - {title}")
        print(f"         by {author}")
        print(f"         {doc.get('item_url', '')}")

        if args.dry_run:
            continue

        # Download text
        print(f"         Downloading...", end=" ", flush=True)
        text = download_hathi_text(htid)

        if not text or len(text) < 1000:
            print("SKIP (too short or failed)")
            continue

        # Save text
        lang_code = normalize_language(doc.get("language", "en"))
        local_path = save_text(text, identifier, year, topic, lang_code)

        # Create metadata entry
        meta_entry = {
            "identifier": identifier,
            "title": doc.get("title"),
            "year": year,
            "creator": doc.get("author"),
            "description": None,
            "topic": topic,
            "language_code": lang_code,
            "language": doc.get("language"),
            "source_url": doc.get("item_url"),
            "record_url": doc.get("record_url"),
            "local_path": local_path,
            "char_count": len(text),
            "downloaded_at": datetime.utcnow().isoformat(),
            "source": "hathitrust",
            "htid": htid,
            "obscurity_score": score,
        }

        metadata.append(meta_entry)
        existing_ids.add(identifier)
        added += 1

        print(f"OK ({len(text):,} chars)")
        time.sleep(args.delay)

    # Save metadata
    if added > 0 and not args.dry_run:
        save_metadata(metadata)

    # Save output list for manual download
    if args.output_list and candidates:
        with open(args.output_list, "w") as f:
            f.write("# HathiTrust texts for manual download\n")
            f.write(f"# Generated by GEMI Corpus Builder\n")
            f.write(f"# Category: {args.category or 'custom'}\n")
            f.write(f"# Year range: {start_year}-{end_year}\n\n")

            for doc in candidates[:args.max_items]:
                f.write(f"## {doc.get('title', 'Unknown')}\n")
                f.write(f"- Year: {doc.get('year')}\n")
                f.write(f"- Author: {doc.get('author', 'Unknown')}\n")
                f.write(f"- Obscurity score: {doc.get('_score', 0):.1f}\n")
                f.write(f"- HTID: {doc.get('htid')}\n")
                f.write(f"- View: {doc.get('item_url')}\n")
                f.write(f"- Catalog: {doc.get('record_url')}\n\n")

        print(f"\nSaved text list to: {args.output_list}")
        print("Note: HathiTrust blocks automated download. Visit URLs to download manually.")

    print("\n" + "=" * 70)
    if added > 0:
        print(f"Added {added} documents from HathiTrust")
    else:
        print(f"Found {len(candidates)} candidates (download blocked - use --output-list)")
    print("=" * 70)


if __name__ == "__main__":
    main()
