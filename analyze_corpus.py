#!/usr/bin/env python3
"""
Claude Corpus Analyzer

Analyzes the historical corpus downloaded from Internet Archive
using Claude API for various research tasks.

Usage:
    pip install anthropic
    export ANTHROPIC_API_KEY=your_key
    python analyze_corpus.py

Tasks:
    - Summarize individual documents
    - Extract key concepts and terminology
    - Trace evolution of ideas over time
    - Find connections between documents
    - Generate research reports
"""

import os
import json
from pathlib import Path
from typing import Optional
from anthropic import Anthropic

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

CORPUS_DIR = Path("corpus")
OUTPUT_DIR = Path("analysis_output")
METADATA_FILE = CORPUS_DIR / "metadata.json"

# Claude model to use
MODEL = "claude-sonnet-4-20250514"

# Maximum tokens to send per document (to manage costs)
MAX_DOC_TOKENS = 8000  # roughly 32k chars

client = Anthropic()


# ══════════════════════════════════════════════════════════════════════════════
# ANALYSIS FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def load_metadata() -> list[dict]:
    """Load corpus metadata."""
    if not METADATA_FILE.exists():
        raise FileNotFoundError(f"Metadata file not found: {METADATA_FILE}")
    with open(METADATA_FILE) as f:
        return json.load(f)


def load_document(filepath: str) -> Optional[str]:
    """Load a document's text, truncating if needed."""
    path = Path(filepath)
    if not path.exists():
        return None
    text = path.read_text(encoding='utf-8', errors='ignore')
    # Truncate to manage token limits (rough estimate: 4 chars per token)
    max_chars = MAX_DOC_TOKENS * 4
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[... truncated ...]"
    return text


def analyze_single_document(doc_metadata: dict, text: str) -> dict:
    """Analyze a single document with Claude."""
    prompt = f"""Analyze this historical document about computing/automation from {doc_metadata['year']}.

Title: {doc_metadata['title']}
Year: {doc_metadata['year']}
Creator: {doc_metadata.get('creator', 'Unknown')}

TEXT:
{text}

Provide a structured analysis:

1. SUMMARY (2-3 sentences)
2. KEY CONCEPTS (list the main technical/philosophical concepts discussed)
3. HISTORICAL CONTEXT (how does this fit into the history of computing/automation?)
4. NOTABLE QUOTES (2-3 significant quotes with page context if available)
5. CONNECTIONS (what other thinkers, inventions, or ideas does this relate to?)
6. TERMINOLOGY (any interesting period-specific terms or neologisms)
"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )

    return {
        "identifier": doc_metadata['identifier'],
        "title": doc_metadata['title'],
        "year": doc_metadata['year'],
        "analysis": response.content[0].text
    }


def trace_concept_evolution(metadata: list[dict], concept: str) -> str:
    """Trace how a concept evolved over time across the corpus."""

    # Sort by year
    sorted_docs = sorted(metadata, key=lambda x: x['year'])

    # Sample documents across time periods
    samples = []
    for doc in sorted_docs[:20]:  # Limit to avoid huge prompts
        text = load_document(doc.get('local_path', ''))
        if text and concept.lower() in text.lower():
            # Extract relevant passages
            paragraphs = text.split('\n\n')
            relevant = [p for p in paragraphs if concept.lower() in p.lower()][:2]
            if relevant:
                samples.append({
                    'year': doc['year'],
                    'title': doc['title'],
                    'excerpts': relevant
                })

    if not samples:
        return f"No documents found discussing '{concept}'"

    prompt = f"""Analyze how the concept of "{concept}" evolved in historical writings about computing and automation.

Here are excerpts from {len(samples)} documents spanning {samples[0]['year']} to {samples[-1]['year']}:

"""
    for sample in samples:
        prompt += f"\n--- {sample['year']}: {sample['title']} ---\n"
        for excerpt in sample['excerpts']:
            prompt += f"{excerpt[:1000]}\n"

    prompt += f"""

Based on these historical sources, trace the evolution of "{concept}":

1. EARLIEST USAGE: How was it first conceptualized?
2. SEMANTIC SHIFTS: How did the meaning change over time?
3. KEY TURNING POINTS: What events or publications shifted understanding?
4. RELATED CONCEPTS: What other terms were used similarly or in opposition?
5. MODERN RESONANCE: How do these historical views connect to modern understanding?
"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=3000,
        messages=[{"role": "user", "content": prompt}]
    )

    return response.content[0].text


def generate_decade_summary(metadata: list[dict], decade: int) -> str:
    """Generate a summary of a particular decade's documents."""

    decade_docs = [d for d in metadata if (d['year'] // 10) * 10 == decade]

    if not decade_docs:
        return f"No documents found for the {decade}s"

    # Load samples from the decade
    samples = []
    for doc in decade_docs[:10]:
        text = load_document(doc.get('local_path', ''))
        if text:
            samples.append({
                'title': doc['title'],
                'year': doc['year'],
                'creator': doc.get('creator', 'Unknown'),
                'excerpt': text[:2000]
            })

    prompt = f"""Synthesize the key themes and ideas about computing/automation from the {decade}s based on these {len(samples)} documents:

"""
    for sample in samples:
        prompt += f"\n--- {sample['year']}: {sample['title']} by {sample['creator']} ---\n"
        prompt += f"{sample['excerpt']}\n"

    prompt += f"""

Provide a synthesis of the {decade}s:

1. DOMINANT THEMES: What were the main preoccupations?
2. KEY FIGURES: Who were the important thinkers/inventors?
3. TECHNOLOGICAL CONTEXT: What machines or inventions were being discussed?
4. CULTURAL ATTITUDES: How did society view automation/thinking machines?
5. PREDICTIONS: What did writers predict about the future?
6. BLIND SPOTS: What did they miss or misunderstand?
"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=3000,
        messages=[{"role": "user", "content": prompt}]
    )

    return response.content[0].text


def find_cross_references(metadata: list[dict]) -> str:
    """Find documents that reference each other or common sources."""

    # Extract all creator names and titles
    creators = set()
    titles = set()
    for doc in metadata:
        if doc.get('creator'):
            creators.add(doc['creator'])
        titles.add(doc['title'])

    # Search for cross-references
    references = []
    for doc in metadata[:30]:  # Limit scope
        text = load_document(doc.get('local_path', ''))
        if not text:
            continue

        found_refs = []
        for creator in creators:
            if creator and creator in text and creator != doc.get('creator'):
                found_refs.append(f"mentions {creator}")

        if found_refs:
            references.append({
                'title': doc['title'],
                'year': doc['year'],
                'refs': found_refs[:5]
            })

    if not references:
        return "No cross-references found in sample"

    summary = "Cross-references found in corpus:\n\n"
    for ref in references:
        summary += f"• {ref['title']} ({ref['year']})\n"
        for r in ref['refs']:
            summary += f"    - {r}\n"

    return summary


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    OUTPUT_DIR.mkdir(exist_ok=True)

    print("Loading corpus metadata...")
    metadata = load_metadata()
    print(f"Found {len(metadata)} documents")

    # Menu
    while True:
        print("\n" + "="*60)
        print("CORPUS ANALYSIS OPTIONS")
        print("="*60)
        print("1. Analyze a single document")
        print("2. Trace concept evolution (e.g., 'thinking machine')")
        print("3. Generate decade summary")
        print("4. Find cross-references")
        print("5. Batch analyze all documents (slow/expensive)")
        print("6. Exit")
        print()

        choice = input("Select option: ").strip()

        if choice == "1":
            print("\nAvailable documents:")
            for i, doc in enumerate(metadata[:20]):
                print(f"  {i+1}. [{doc['year']}] {doc['title'][:50]}")
            idx = int(input("Select document number: ")) - 1
            if 0 <= idx < len(metadata):
                doc = metadata[idx]
                text = load_document(doc.get('local_path', ''))
                if text:
                    print("\nAnalyzing...")
                    result = analyze_single_document(doc, text)
                    print("\n" + result['analysis'])

                    # Save
                    outfile = OUTPUT_DIR / f"analysis_{doc['identifier']}.json"
                    with open(outfile, 'w') as f:
                        json.dump(result, f, indent=2)
                    print(f"\nSaved to {outfile}")

        elif choice == "2":
            concept = input("Enter concept to trace (e.g., 'thinking machine'): ").strip()
            print(f"\nTracing '{concept}' across corpus...")
            result = trace_concept_evolution(metadata, concept)
            print("\n" + result)

            outfile = OUTPUT_DIR / f"evolution_{concept.replace(' ', '_')}.txt"
            outfile.write_text(result)
            print(f"\nSaved to {outfile}")

        elif choice == "3":
            print("\nAvailable decades:")
            decades = sorted(set((d['year'] // 10) * 10 for d in metadata))
            for d in decades:
                count = len([x for x in metadata if (x['year'] // 10) * 10 == d])
                print(f"  {d}s ({count} docs)")
            decade = int(input("Enter decade (e.g., 1890): "))
            print(f"\nGenerating {decade}s summary...")
            result = generate_decade_summary(metadata, decade)
            print("\n" + result)

            outfile = OUTPUT_DIR / f"decade_{decade}s.txt"
            outfile.write_text(result)
            print(f"\nSaved to {outfile}")

        elif choice == "4":
            print("\nFinding cross-references...")
            result = find_cross_references(metadata)
            print("\n" + result)

        elif choice == "5":
            confirm = input("This will analyze all documents and may be expensive. Continue? (y/n): ")
            if confirm.lower() == 'y':
                results = []
                for i, doc in enumerate(metadata):
                    print(f"\nAnalyzing {i+1}/{len(metadata)}: {doc['title'][:40]}...")
                    text = load_document(doc.get('local_path', ''))
                    if text:
                        result = analyze_single_document(doc, text)
                        results.append(result)

                        # Save incrementally
                        outfile = OUTPUT_DIR / "batch_analysis.json"
                        with open(outfile, 'w') as f:
                            json.dump(results, f, indent=2)

                print(f"\nBatch analysis complete: {len(results)} documents")

        elif choice == "6":
            break


if __name__ == "__main__":
    main()
