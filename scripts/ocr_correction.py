#!/usr/bin/env python3
"""
OCR post-correction for historical texts using local Ollama model.

Two modes:
1. Rule-based (fast) - fixes common OCR errors with regex
2. Ollama LLM (better quality) - uses local llama3.2:3b model (free)

Usage:
    python scripts/ocr_correction.py --text "some ocr text"
    python scripts/ocr_correction.py --text "text" --use-llm
    python scripts/ocr_correction.py --test
    python scripts/ocr_correction.py --correct-corpus  # Fix all corpus texts
"""

import argparse
import re
import os
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv('.env.local')

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3.2:3b"

# ══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS (must be defined before OCR_PATTERNS)
# ══════════════════════════════════════════════════════════════════════════════

# Dictionary of words commonly split by OCR
COMMON_WORDS = {
    'adjustments', 'understanding', 'intelligence', 'mechanical', 'automaton',
    'automata', 'machine', 'machines', 'mechanism', 'calculating', 'calculation',
    'philosophical', 'artificial', 'reasoning', 'thinking', 'movement',
    'observation', 'construction', 'performance', 'extraordinary', 'wonderful',
    'ingenious', 'remarkable', 'principle', 'principles', 'substance',
    'substances', 'consciousness', 'conscious', 'sensation', 'sensations',
    'perception', 'perceptions', 'imagination', 'understanding', 'knowledge',
    'experience', 'experiments', 'operations', 'operation', 'faculties',
    'faculty', 'natural', 'nature', 'motion', 'motions', 'animal', 'animals',
    'human', 'spirit', 'spirits', 'spiritual', 'material', 'matter',
    'philosophy', 'philosopher', 'philosophers', 'science', 'sciences',
    'certainly', 'certainty', 'necessary', 'necessarily', 'impossible',
    'possibility', 'particular', 'particularly', 'different', 'difference',
}


def rejoin_split_word(match):
    """
    Try to rejoin a split word ONLY if the combined form is a known word.
    Very conservative - only rejoins when we're confident it's correct.
    """
    part1, part2 = match.group(1), match.group(2)
    combined = part1 + part2

    # ONLY rejoin if combined is a known word in our dictionary
    if combined.lower() in COMMON_WORDS:
        return combined

    # Otherwise keep the original (with space preserved)
    return part1 + ' ' + part2


def fix_possessive(match):
    """Fix possessive forms like Babbagis → Babbage's."""
    word = match.group(1)
    # Common names that might have possessive
    names = {'babbag', 'descart', 'newton', 'leibniz', 'boyl', 'lock', 'hobb',
             'turing', 'pascal', 'fermat', 'euler', 'gauss'}
    if word.lower() in names:
        return word + "e's"
    return match.group(0)


# ══════════════════════════════════════════════════════════════════════════════
# RULE-BASED CORRECTIONS
# ══════════════════════════════════════════════════════════════════════════════

# Regex patterns for common OCR errors
OCR_PATTERNS = [
    # Fix specific known split words (more reliable than generic pattern)
    (r'\badj ustments?\b', 'adjustments'),
    (r'\bPrinc iple', 'Principle'),
    (r'\bprinc iple', 'principle'),
    (r'\bunder standing', 'understanding'),
    (r'\bintell igence', 'intelligence'),
    (r'\bmech anical', 'mechanical'),
    (r'\bauto maton', 'automaton'),
    (r'\bauto mata', 'automata'),
    (r'\bmech anism', 'mechanism'),
    (r'\bcalcul ating', 'calculating'),
    (r'\bphilos ophical', 'philosophical'),
    (r'\bartif icial', 'artificial'),
    (r'\breason ing', 'reasoning'),
    (r'\bthink ing', 'thinking'),
    (r'\bmove ment', 'movement'),
    (r'\bobserv ation', 'observation'),
    (r'\bconstr uction', 'construction'),
    (r'\bperform ance', 'performance'),
    (r'\bextraord inary', 'extraordinary'),
    (r'\bwonder ful', 'wonderful'),
    (r'\bingen ious', 'ingenious'),
    (r'\bremar kable', 'remarkable'),
    (r'\bsubst ance', 'substance'),
    (r'\bconscious ness', 'consciousness'),
    (r'\bsens ation', 'sensation'),
    (r'\bpercep tion', 'perception'),
    (r'\bimag ination', 'imagination'),
    (r'\bknow ledge', 'knowledge'),
    (r'\bexper ience', 'experience'),
    (r'\boper ation', 'operation'),
    (r'\bfacul ties', 'faculties'),

    # vv → w at start of words
    (r'\bvv', 'w'),

    # Common "tli" → "th" errors
    (r'\btlie\b', 'the'),
    (r'\btliat\b', 'that'),
    (r'\btliis\b', 'this'),
    (r'\btliey\b', 'they'),
    (r'\btliere\b', 'there'),
    (r'\btlieir\b', 'their'),
    (r'\btliese\b', 'these'),
    (r'\btliose\b', 'those'),
    (r'\btliough\b', 'though'),
    (r'\btlien\b', 'then'),
    (r'\btlius\b', 'thus'),
    (r'\bwitli\b', 'with'),
    (r'\bwliich\b', 'which'),
    (r'\bwliat\b', 'what'),
    (r'\bwlien\b', 'when'),
    (r'\bwliere\b', 'where'),

    # Common "li" → "h" errors (at start of word)
    (r'\bliave\b', 'have'),
    (r'\bliaving\b', 'having'),
    (r'\bliad\b', 'had'),
    (r'\blias\b', 'has'),
    (r'\bliim\b', 'him'),
    (r'\bliis\b', 'his'),
    (r'\blier\b', 'her'),
    (r'\bliow\b', 'how'),
    (r'\bsliould\b', 'should'),
    (r'\bwliole\b', 'whole'),
    (r'\bnotliing\b', 'nothing'),
    (r'\bsometliing\b', 'something'),
    (r'\beverytliing\b', 'everything'),

    # "cli" → "ch" errors (inside words)
    (r'\bmacliine', 'machine'),
    (r'\bwliicli\b', 'which'),
    (r'\bsucli\b', 'such'),
    (r'\beacli\b', 'each'),
    (r'\bmucli\b', 'much'),

    # Long-s (ſ) transcribed as f - common words
    (r'\bfaid\b', 'said'),
    (r'\bfame\b(?!\s+as)', 'same'),  # but not "fame as"
    (r'\bfuch\b', 'such'),
    (r'\bfhall\b', 'shall'),
    (r'\bfhould\b', 'should'),
    (r'\bfelf\b', 'self'),
    (r'\bfome\b', 'some'),
    (r'\bfoon\b', 'soon'),
    (r'\bfeems?\b', lambda m: 'seem' + ('s' if m.group().endswith('s') else '')),
    (r'\bfeen\b', 'seen'),
    (r'\bfince\b', 'since'),
    (r'\bftill\b', 'still'),
    (r'\bftrong\b', 'strong'),
    (r'\bfpirit', 'spirit'),
    (r'\bfcience\b', 'science'),
    (r'\bfoul\b', 'soul'),
    (r'\breafonn?\b', lambda m: 'reason' + ('s' if m.group().endswith('s') else '')),
    (r'\bunderftand', 'understand'),
    (r'\bObfervation', 'Observation'),
    (r'\bobfervation', 'observation'),
    (r'\bfource\b', 'source'),
    (r'\bfubftance', 'substance'),
    (r'\bdifcour', 'discour'),
    (r'\bconftruct', 'construct'),
    (r'\bpoffible\b', 'possible'),
    (r'\bimpoffible\b', 'impossible'),
    (r'\bneceflary\b', 'necessary'),
    (r'\bpaffion\b', 'passion'),
    (r'\bfenfation\b', 'sensation'),
    (r'\bconfciou', 'consciou'),
    (r'\bintelligenf', 'intelligent'),
    (r'\bmachinef\b', 'machines'),
    (r'\bfyft', 'syst'),  # fyftem → system
    (r'\bfubject', 'subject'),
    (r'\bfuppos', 'suppos'),
    (r'\bfatisf', 'satisf'),
    (r'\bfociet', 'societ'),
    (r'\bfecret', 'secret'),
    (r'\bferies\b', 'series'),
    (r'\bfimil', 'simil'),
    (r'\bfenf', 'sens'),
    (r'\bfever', 'sever'),
    (r'\bfuffer', 'suffer'),

    # Common possessive errors (Babbagis → Babbage's)
    (r"(\w+[^aeiou])is\b", fix_possessive),

    # Stray characters from scanning
    (r'\s*[\^|]\s*', ' '),  # Remove stray ^ and | characters
    (r'\s+', ' '),  # Normalize whitespace
]


def apply_rules(text: str) -> str:
    """Apply rule-based OCR corrections."""
    result = text

    for pattern, replacement in OCR_PATTERNS:
        if callable(replacement):
            # Split word rejoining - case insensitive
            result = re.sub(pattern, replacement, result)
        else:
            # Character substitutions - case insensitive for matching,
            # but try to preserve case in output
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

    # Clean up any double spaces introduced
    result = re.sub(r'  +', ' ', result)

    return result.strip()


# ══════════════════════════════════════════════════════════════════════════════
# OLLAMA LLM CORRECTION (FREE, LOCAL)
# ══════════════════════════════════════════════════════════════════════════════

def fix_with_ollama(text: str) -> str:
    """Use local Ollama model for OCR correction (free)."""

    prompt = f"""Fix OCR errors in this historical text. Rules:
- Fix split words (e.g., "adj ustments" → "adjustments")
- The long-s (ſ) is often OCR'd as 'f' - fix these (e.g., "faid" → "said")
- Fix garbled characters and possessives (e.g., "Babbagis" → "Babbage's")
- Keep intentional archaic spellings (e.g., "shew", "connexion")
- Return ONLY the corrected text, nothing else.

Text: {text}"""

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": len(text) + 200,
                }
            },
            timeout=120
        )

        if response.ok:
            return response.json().get("response", text).strip()
        else:
            print(f"Ollama error: {response.status_code}")
            return text

    except requests.exceptions.ConnectionError:
        print("Ollama not running. Start with: brew services start ollama")
        return text
    except requests.exceptions.Timeout:
        print("Ollama timeout - model may be loading. Try again.")
        return text
    except Exception as e:
        print(f"Error: {e}")
        return text


# ══════════════════════════════════════════════════════════════════════════════
# MAIN API
# ══════════════════════════════════════════════════════════════════════════════

def correct_text(text: str, use_llm: bool = False) -> str:
    """
    Correct OCR errors in text.

    Args:
        text: Input text with potential OCR errors
        use_llm: Use local Ollama model for better quality (free but slower)
    """
    # Always apply rule-based fixes first (fast)
    result = apply_rules(text)

    # Optionally use LLM for remaining issues
    if use_llm:
        result = fix_with_ollama(result)

    return result


def correct_corpus_file(filepath: Path, use_llm: bool = False) -> tuple[str, int]:
    """Correct OCR in a single corpus file. Returns (corrected_text, num_changes)."""
    original = filepath.read_text(encoding='utf-8', errors='ignore')
    corrected = correct_text(original, use_llm=use_llm)

    # Count approximate changes
    changes = sum(1 for a, b in zip(original.split(), corrected.split()) if a != b)

    return corrected, changes


def correct_all_corpus(use_llm: bool = False, dry_run: bool = True):
    """Correct OCR in all corpus files."""
    corpus_dir = Path("corpus/raw_texts")
    if not corpus_dir.exists():
        print(f"Corpus directory not found: {corpus_dir}")
        return

    files = list(corpus_dir.glob("*.txt"))
    print(f"Found {len(files)} text files in corpus")

    total_changes = 0
    for filepath in files:
        corrected, changes = correct_corpus_file(filepath, use_llm=use_llm)

        if changes > 0:
            print(f"  {filepath.name}: {changes} corrections")
            total_changes += changes

            if not dry_run:
                filepath.write_text(corrected, encoding='utf-8')

    print(f"\nTotal corrections: {total_changes}")
    if dry_run:
        print("(Dry run - no files modified. Use --apply to save changes)")


# ══════════════════════════════════════════════════════════════════════════════
# TESTS
# ══════════════════════════════════════════════════════════════════════════════

def test_correction():
    """Test OCR correction with sample texts."""
    test_cases = [
        (
            "of his mental adj ustments. Given certain factors ^ and a sound brain should always evolve the same fixed product with the certainty of Babbagis calculating machine",
            ["adjustments", "Babbage's", "calculating machine"]
        ),
        (
            "The Vital Princ iple of Man is tlie fource of all his Actions",
            ["Principle", "the", "source"]
        ),
        (
            "vvhich mechanical contrivances may be made to imitate tlie motions of life",
            ["which", "the", "motions"]
        ),
        (
            "It feems impoffible tliat fuch a macliine fhould reafon",
            ["seems", "impossible", "that", "such", "should", "reason"]
        ),
    ]

    print("Testing OCR correction (rule-based)...\n")
    print("=" * 70)

    all_passed = True
    for original, expected in test_cases:
        print(f"\nOriginal:\n  {original}\n")

        corrected = apply_rules(original)
        print(f"Corrected:\n  {corrected}\n")

        for exp in expected:
            if exp.lower() in corrected.lower():
                print(f"  ✓ '{exp}'")
            else:
                print(f"  ✗ Missing '{exp}'")
                all_passed = False

        print("-" * 70)

    if all_passed:
        print("\n✓ All tests passed!")
    else:
        print("\n✗ Some tests failed")


def main():
    parser = argparse.ArgumentParser(description="OCR post-correction (free, local)")
    parser.add_argument('--text', '-t', help="Text to correct")
    parser.add_argument('--file', '-f', help="File to correct")
    parser.add_argument('--test', action='store_true', help="Run test cases")
    parser.add_argument('--use-llm', action='store_true', help="Use Ollama LLM (better but slower)")
    parser.add_argument('--correct-corpus', action='store_true', help="Correct all corpus files")
    parser.add_argument('--apply', action='store_true', help="Actually save changes (with --correct-corpus)")

    args = parser.parse_args()

    if args.test:
        test_correction()
    elif args.correct_corpus:
        correct_all_corpus(use_llm=args.use_llm, dry_run=not args.apply)
    elif args.text:
        result = correct_text(args.text, use_llm=args.use_llm)
        print(result)
    elif args.file:
        text = Path(args.file).read_text()
        result = correct_text(text, use_llm=args.use_llm)
        print(result)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
