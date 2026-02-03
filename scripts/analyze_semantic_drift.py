#!/usr/bin/env python3
"""
Analyze semantic drift of key terms across the GEMI corpus using embedding models.

Uses sentence embeddings to track how words like "intelligence", "automaton",
and "engine" change meaning across centuries.

Usage:
    python scripts/analyze_semantic_drift.py
    python scripts/analyze_semantic_drift.py --terms "intelligence,machine,learning"
"""

import os
import sys
import json
import re
import argparse
from pathlib import Path
from collections import defaultdict
from dotenv import load_dotenv
import numpy as np

load_dotenv('.env.local')

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

CORPUS_DIR = Path("corpus")
METADATA_FILE = CORPUS_DIR / "metadata.json"
RAW_TEXTS_DIR = CORPUS_DIR / "raw_texts"
OUTPUT_FILE = Path("public/data/semantic-drift.json")

# Embedding model - multilingual, handles Latin/French/German
MODEL_NAME = "intfloat/multilingual-e5-small"  # Smaller, faster for MVP
# Alternative: "BAAI/bge-m3" (better but larger)

# Terms to analyze with their multilingual variants
TERM_VARIANTS = {
    "intelligence": [
        "intelligence", "intelligenz", "intelligentia", "intellect",
        "understanding", "verstand", "entendement", "reason"
    ],
    "automaton": [
        "automaton", "automata", "automate", "automat", "automaten",
        "android", "mechanical man", "machine man", "robot"
    ],
    "engine": [
        "engine", "engin", "machine", "maschine", "machina", "mechanick",
        "mechanic", "mechanism", "mechanismus", "device", "apparatus"
    ],
    "learning": [
        "learning", "lernen", "apprendre", "study", "education",
        "instruction", "training", "habit", "memory"
    ],
    "soul": [
        "soul", "seele", "âme", "anima", "spirit", "geist", "esprit",
        "mind", "psyche"
    ],
}

# ══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

# Boilerplate phrases to filter out (Google Books, HathiTrust, etc.)
BOILERPLATE_PATTERNS = [
    r'google book search',
    r'automated querying',
    r'automated queries',
    r'non-commercial use',
    r'public domain',
    r'copyright law',
    r'generated from',
    r'hathitrust',
    r'digitized by',
    r'scanned from',
    r'this is a digital copy',
    r'terms of service',
    r'google\'s mission',
]

def is_boilerplate(text: str) -> bool:
    """Check if text is likely boilerplate from digitization."""
    text_lower = text.lower()
    for pattern in BOILERPLATE_PATTERNS:
        if re.search(pattern, text_lower):
            return True
    return False


def load_metadata() -> list[dict]:
    """Load corpus metadata."""
    with open(METADATA_FILE) as f:
        return json.load(f)


def extract_sentences(text: str, term_variants: list[str], context_window: int = 150) -> list[str]:
    """
    Extract sentences/contexts containing any of the term variants.
    Returns context windows around each match.
    Uses word boundary matching to avoid partial matches (e.g., 'automated' for 'automat').
    """
    contexts = []

    for variant in term_variants:
        # Use word boundary matching to avoid partial matches
        # \b matches word boundaries
        pattern = re.compile(r'\b' + re.escape(variant) + r'\b', re.IGNORECASE)

        for match in pattern.finditer(text):
            pos = match.start()

            # Extract context window
            ctx_start = max(0, pos - context_window)
            ctx_end = min(len(text), pos + len(variant) + context_window)

            # Try to extend to sentence boundaries
            while ctx_start > 0 and text[ctx_start] not in '.!?\n':
                ctx_start -= 1
            while ctx_end < len(text) and text[ctx_end] not in '.!?\n':
                ctx_end += 1

            context = text[ctx_start:ctx_end].strip()
            # Clean up OCR artifacts
            context = re.sub(r'\s+', ' ', context)
            context = context[:500]  # Limit length

            # Skip very short matches and boilerplate
            if len(context) > 50 and not is_boilerplate(context):
                contexts.append(context)

    return contexts


def get_decade(year: int) -> str:
    """Convert year to decade string."""
    decade = (year // 10) * 10
    return f"{decade}s"


def compute_centroid(embeddings: np.ndarray) -> np.ndarray:
    """Compute the centroid (mean) of embeddings."""
    return np.mean(embeddings, axis=0)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


# ══════════════════════════════════════════════════════════════════════════════
# MAIN ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════

def analyze_semantic_drift(terms: list[str]):
    """Main analysis function."""
    from sentence_transformers import SentenceTransformer

    print("=" * 60)
    print("GEMI Semantic Drift Analysis")
    print("=" * 60 + "\n")

    # Load model
    print(f"Loading embedding model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    print("Model loaded.\n")

    # Load metadata and texts
    metadata = load_metadata()
    print(f"Loaded {len(metadata)} documents\n")

    # Results structure
    results = {
        "model": MODEL_NAME,
        "terms": {},
        "timeline": [],
    }

    # Collect all decades for timeline
    all_decades = set()

    for term in terms:
        print(f"\n{'='*40}")
        print(f"Analyzing: {term.upper()}")
        print(f"{'='*40}")

        variants = TERM_VARIANTS.get(term, [term])
        print(f"Variants: {', '.join(variants)}")

        # Collect contexts by decade
        contexts_by_decade = defaultdict(list)
        example_sentences = defaultdict(list)

        for doc in metadata:
            local_path = doc.get("local_path")
            if not local_path:
                continue

            # Find the text file
            text_path = Path(local_path)
            if not text_path.exists():
                text_path = RAW_TEXTS_DIR / Path(local_path).name
            if not text_path.exists():
                continue

            # Read text
            try:
                text = text_path.read_text(encoding='utf-8', errors='ignore')
            except:
                continue

            # Extract contexts
            contexts = extract_sentences(text, variants)
            if contexts:
                decade = get_decade(doc["year"])
                all_decades.add(decade)
                contexts_by_decade[decade].extend(contexts)

                # Store example sentences (up to 3 per decade)
                for ctx in contexts[:3]:
                    if len(example_sentences[decade]) < 5:
                        example_sentences[decade].append({
                            "text": ctx[:300] + ("..." if len(ctx) > 300 else ""),
                            "year": doc["year"],
                            "title": doc["title"][:50],
                            "doc_id": doc["identifier"]
                        })

        print(f"\nContexts found by decade:")
        for decade in sorted(contexts_by_decade.keys()):
            print(f"  {decade}: {len(contexts_by_decade[decade])} contexts")

        # Compute embeddings and centroids by decade
        centroids = {}
        embeddings_2d = {}

        for decade, contexts in contexts_by_decade.items():
            if len(contexts) < 2:
                continue

            print(f"  Embedding {decade}...", end=" ", flush=True)
            # Limit to avoid memory issues
            contexts_sample = contexts[:100]
            embeddings = model.encode(contexts_sample, show_progress_bar=False)
            centroid = compute_centroid(embeddings)
            centroids[decade] = centroid
            print(f"done ({len(contexts_sample)} samples)")

        # Compute drift metrics (similarity between adjacent decades)
        sorted_decades = sorted(centroids.keys())
        drift_data = []

        # Use first decade as reference point
        if sorted_decades:
            reference_centroid = centroids[sorted_decades[0]]

            for decade in sorted_decades:
                similarity_to_origin = cosine_similarity(centroids[decade], reference_centroid)
                drift_data.append({
                    "decade": decade,
                    "similarity_to_origin": round(similarity_to_origin, 4),
                    "num_contexts": len(contexts_by_decade[decade]),
                    "examples": example_sentences.get(decade, [])
                })

        # Compute pairwise drift between adjacent decades
        for i in range(1, len(sorted_decades)):
            prev_decade = sorted_decades[i-1]
            curr_decade = sorted_decades[i]
            sim = cosine_similarity(centroids[prev_decade], centroids[curr_decade])
            # Find the drift data entry and add adjacent similarity
            for d in drift_data:
                if d["decade"] == curr_decade:
                    d["similarity_to_previous"] = round(sim, 4)

        results["terms"][term] = {
            "variants": variants,
            "total_contexts": sum(len(c) for c in contexts_by_decade.values()),
            "decades_covered": len(centroids),
            "drift": drift_data,
        }

        print(f"\n{term}: {results['terms'][term]['total_contexts']} total contexts across {results['terms'][term]['decades_covered']} decades")

    # Build timeline
    results["timeline"] = sorted(list(all_decades))

    # Save results
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n{'='*60}")
    print(f"Results saved to: {OUTPUT_FILE}")
    print(f"{'='*60}")

    return results


# ══════════════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Analyze semantic drift in GEMI corpus")
    parser.add_argument(
        '--terms', '-t',
        default="intelligence,automaton,engine",
        help="Comma-separated list of terms to analyze"
    )
    args = parser.parse_args()

    terms = [t.strip() for t in args.terms.split(',')]
    analyze_semantic_drift(terms)


if __name__ == "__main__":
    main()
