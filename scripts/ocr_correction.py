#!/usr/bin/env python3
"""
OCR post-correction for historical texts.

Two modes:
1. Rule-based (fast, local) - fixes common OCR errors
2. Gemini API (better quality) - uses your existing API key

Usage:
    python scripts/ocr_correction.py --text "some ocr text"
    python scripts/ocr_correction.py --text "text" --use-gemini
    python scripts/ocr_correction.py --test
"""

import argparse
import re
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv('.env.local')

# ══════════════════════════════════════════════════════════════════════════════
# RULE-BASED CORRECTIONS
# ══════════════════════════════════════════════════════════════════════════════

# Common English words (to avoid joining valid word pairs)
COMMON_SHORT_WORDS = {
    'a', 'an', 'the', 'and', 'or', 'but', 'for', 'nor', 'so', 'yet',
    'in', 'on', 'at', 'to', 'of', 'by', 'as', 'is', 'it', 'be', 'do',
    'he', 'she', 'we', 'they', 'you', 'i', 'me', 'my', 'his', 'her',
    'all', 'any', 'can', 'had', 'has', 'was', 'were', 'are', 'been',
    'not', 'now', 'out', 'own', 'one', 'our', 'per', 'put', 'say',
    'adj', 'adv',  # Keep these as potential split fragments
}

# Known split word patterns: (fragment1, fragment2) → combined
KNOWN_SPLITS = {
    ('adj', 'ustments'): 'adjustments',
    ('adjust', 'ments'): 'adjustments',
    ('under', 'standing'): 'understanding',
    ('under', 'stand'): 'understand',
    ('intelli', 'gence'): 'intelligence',
    ('mechan', 'ical'): 'mechanical',
    ('autom', 'aton'): 'automaton',
    ('autom', 'ata'): 'automata',
    ('mech', 'anism'): 'mechanism',
    ('calcul', 'ating'): 'calculating',
    ('calcul', 'ation'): 'calculation',
    ('philos', 'ophical'): 'philosophical',
    ('artif', 'icial'): 'artificial',
    ('reason', 'ing'): 'reasoning',
    ('think', 'ing'): 'thinking',
    ('move', 'ment'): 'movement',
    ('observ', 'ation'): 'observation',
    ('construct', 'ion'): 'construction',
    ('perform', 'ance'): 'performance',
    ('extra', 'ordinary'): 'extraordinary',
    ('wonder', 'ful'): 'wonderful',
    ('ingen', 'ious'): 'ingenious',
    ('remark', 'able'): 'remarkable',
    ('princ', 'iple'): 'principle',
    ('princ', 'iples'): 'principles',
    ('subst', 'ance'): 'substance',
    ('subst', 'ances'): 'substances',
    ('conscious', 'ness'): 'consciousness',
    ('consc', 'ious'): 'conscious',
    ('sens', 'ation'): 'sensation',
    ('sens', 'ations'): 'sensations',
    ('percept', 'ion'): 'perception',
    ('percept', 'ions'): 'perceptions',
    ('imagin', 'ation'): 'imagination',
    ('know', 'ledge'): 'knowledge',
    ('exper', 'ience'): 'experience',
    ('exper', 'iments'): 'experiments',
    ('operat', 'ions'): 'operations',
    ('operat', 'ion'): 'operation',
    ('facult', 'ies'): 'faculties',
    ('facult', 'y'): 'faculty',
    ('natur', 'al'): 'natural',
    ('nat', 'ure'): 'nature',
    ('mot', 'ion'): 'motion',
    ('mot', 'ions'): 'motions',
    ('anim', 'al'): 'animal',
    ('anim', 'als'): 'animals',
    ('hum', 'an'): 'human',
    ('spir', 'it'): 'spirit',
    ('spir', 'its'): 'spirits',
    ('spirit', 'ual'): 'spiritual',
    ('mater', 'ial'): 'material',
    ('matt', 'er'): 'matter',
    ('philos', 'ophy'): 'philosophy',
    ('philos', 'opher'): 'philosopher',
    ('philos', 'ophers'): 'philosophers',
    ('sci', 'ence'): 'science',
    ('sci', 'ences'): 'sciences',
    ('mach', 'ine'): 'machine',
    ('mach', 'ines'): 'machines',
}


def fix_split_words(text: str) -> str:
    """Fix known split word patterns."""
    result = text
    for (p1, p2), combined in KNOWN_SPLITS.items():
        # Match with case insensitivity but preserve original case
        pattern = re.compile(rf'\b({re.escape(p1)})\s+({re.escape(p2)})\b', re.IGNORECASE)
        result = pattern.sub(combined, result)
    return result


def fix_possessive(match):
    """Fix possessive forms like Babbagis → Babbage's."""
    word = match.group(1)
    if word.lower() in {'babbag', 'descart', 'newton', 'leibniz', 'boyl', 'lock', 'hobb'}:
        return word + "e's"
    return match.group(0)


def apply_rules(text: str) -> str:
    """Apply rule-based OCR corrections."""
    result = text

    # First pass: fix known split words
    result = fix_split_words(result)

    # Second pass: character-level fixes (order matters!)
    patterns = [
        # vv → w at start of words
        (r'\bvv', 'w'),

        # li → h patterns (tlie → the, etc.)
        (r'\btlie\b', 'the'),
        (r'\bTlie\b', 'The'),
        (r'\btliat\b', 'that'),
        (r'\bTliat\b', 'That'),
        (r'\btliis\b', 'this'),
        (r'\bTliis\b', 'This'),
        (r'\btliey\b', 'they'),
        (r'\bTliey\b', 'They'),
        (r'\btliere\b', 'there'),
        (r'\bTliere\b', 'There'),
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
        (r'\bliave\b', 'have'),
        (r'\bliaving\b', 'having'),
        (r'\bliad\b', 'had'),
        (r'\blias\b', 'has'),
        (r'\bliim\b', 'him'),
        (r'\bliis\b', 'his'),
        (r'\blier\b', 'her'),
        (r'\bliow\b', 'how'),
        (r'\bsliould\b', 'should'),
        (r'\bmacliine\b', 'machine'),
        (r'\bmacliines\b', 'machines'),

        # Long-s (ſ) transcribed as f
        (r'\bfaid\b', 'said'),
        (r'\bfay\b', 'say'),
        (r'\bfays\b', 'says'),
        (r'\bfuch\b', 'such'),
        (r'\bfhall\b', 'shall'),
        (r'\bfhould\b', 'should'),
        (r'\bfelf\b', 'self'),
        (r'\bfome\b', 'some'),
        (r'\bfoon\b', 'soon'),
        (r'\bfeems\b', 'seems'),
        (r'\bfeem\b', 'seem'),
        (r'\bfeen\b', 'seen'),
        (r'\bfee\b', 'see'),
        (r'\bfince\b', 'since'),
        (r'\bftill\b', 'still'),
        (r'\bftrong\b', 'strong'),
        (r'\bfpirit\b', 'spirit'),
        (r'\bfpirits\b', 'spirits'),
        (r'\bfcience\b', 'science'),
        (r'\bfoul\b', 'soul'),
        (r'\bfouls\b', 'souls'),
        (r'\breafon\b', 'reason'),
        (r'\breafons\b', 'reasons'),
        (r'\breafoning\b', 'reasoning'),
        (r'\bunderftand\b', 'understand'),
        (r'\bunderftanding\b', 'understanding'),
        (r'\bObfervation\b', 'Observation'),
        (r'\bobfervation\b', 'observation'),
        (r'\bfource\b', 'source'),
        (r'\bfources\b', 'sources'),
        (r'\bfubftance\b', 'substance'),
        (r'\bSubftance\b', 'Substance'),
        (r'\bdifcourfe\b', 'discourse'),
        (r'\bconftruct\b', 'construct'),
        (r'\bpoffible\b', 'possible'),
        (r'\bimpoffible\b', 'impossible'),
        (r'\bneceflary\b', 'necessary'),
        (r'\bpaffion\b', 'passion'),
        (r'\bfenfation\b', 'sensation'),
        (r'\bconfcious\b', 'conscious'),
        (r'\bconfciousnefs\b', 'consciousness'),

        # Stray characters
        (r'\s*[\^|]\s*', ' '),  # Remove stray ^ and | characters
        (r'\s{2,}', ' '),  # Normalize multiple spaces
    ]

    for pattern, replacement in patterns:
        result = re.sub(pattern, replacement, result)

    # Possessive fixes (Babbagis → Babbage's)
    result = re.sub(r"(\w+[^aeiou])is\b", fix_possessive, result)

    return result.strip()


# ══════════════════════════════════════════════════════════════════════════════
# GEMINI API CORRECTION
# ══════════════════════════════════════════════════════════════════════════════

def fix_with_gemini(text: str) -> str:
    """Use Gemini API for OCR correction."""
    try:
        from google import genai
    except ImportError:
        print("Install google-genai: pip install google-genai")
        return text

    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("Set GEMINI_API_KEY in .env.local")
        return text

    client = genai.Client(api_key=api_key)

    prompt = f"""Fix OCR errors in this historical text. Rules:
- Fix obvious scanning errors (split words, garbled characters, wrong letters)
- The long-s (ſ) is often transcribed as 'f' - fix these (e.g., "faid" → "said", "fuch" → "such")
- Fix possessives (e.g., "Babbagis" → "Babbage's")
- Keep intentional archaic spellings (e.g., "shew" for "show", "connexion" for "connection")
- Remove stray characters (^, |, etc.)
- Return ONLY the corrected text, nothing else.

Text:
{text}"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=prompt
        )
        return response.text.strip()
    except Exception as e:
        print(f"Gemini error: {e}")
        return text


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def correct_text(text: str, use_gemini: bool = False) -> str:
    """
    Correct OCR errors in text.

    Args:
        text: Input text with potential OCR errors
        use_gemini: Use Gemini API for better quality (requires API key)
    """
    # Always apply rule-based fixes first (fast)
    result = apply_rules(text)

    # Optionally use Gemini for remaining issues
    if use_gemini:
        result = fix_with_gemini(result)

    return result


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
            ["seems", "impossible", "that", "such", "machine", "should", "reason"]
        ),
    ]

    print("Testing OCR correction...\n")
    print("=" * 70)

    for original, expected in test_cases:
        print(f"\nOriginal:\n  {original}\n")

        corrected = apply_rules(original)
        print(f"Corrected:\n  {corrected}\n")

        passed = 0
        for exp in expected:
            if exp.lower() in corrected.lower():
                print(f"  ✓ Contains '{exp}'")
                passed += 1
            else:
                print(f"  ✗ Missing '{exp}'")

        print(f"  [{passed}/{len(expected)} passed]")
        print("-" * 70)


def main():
    parser = argparse.ArgumentParser(description="OCR post-correction")
    parser.add_argument('--text', '-t', help="Text to correct")
    parser.add_argument('--file', '-f', help="File to correct")
    parser.add_argument('--test', action='store_true', help="Run test cases")
    parser.add_argument('--use-gemini', action='store_true', help="Use Gemini API for better quality")

    args = parser.parse_args()

    if args.test:
        test_correction()
    elif args.text:
        result = correct_text(args.text, use_gemini=args.use_gemini)
        print(result)
    elif args.file:
        text = Path(args.file).read_text()
        result = correct_text(text, use_gemini=args.use_gemini)
        print(result)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
