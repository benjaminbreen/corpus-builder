#!/usr/bin/env python3
"""
OCR Quality Evaluation Script

Compares OCR output against ground truth (Wikisource) to measure:
- Character Error Rate (CER)
- Word Error Rate (WER)
- Improvement from OCR correction

Usage:
    python scripts/ocr_evaluation.py --test           # Run on test samples
    python scripts/ocr_evaluation.py --evaluate       # Evaluate all available pairs
    python scripts/ocr_evaluation.py --sample FILE    # Show sample comparison
"""

import argparse
import re
from pathlib import Path
from difflib import SequenceMatcher
from typing import Optional
import json

# Import the correction functions
from ocr_correction import apply_rules, correct_text


def clean_text(text: str) -> str:
    """Normalize text for comparison."""
    # Remove page markers
    text = re.sub(r'---\s*Page\s*\d+\s*---', '', text)
    # Remove Google Books boilerplate
    text = re.sub(r'(Google.?books?|ogneeary GOORLe|viatizcay GOOLE|Digitized by)', '', text, flags=re.IGNORECASE)
    # Remove URLs
    text = re.sub(r'http[s]?://\S+', '', text)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text)
    # Remove excessive punctuation
    text = re.sub(r'[^\w\s.,;:!?\'"()-]', '', text)
    return text.strip()


def extract_sentences(text: str, min_length: int = 50) -> list[str]:
    """Extract sentences from text for comparison."""
    # Split on sentence boundaries
    sentences = re.split(r'(?<=[.!?])\s+', text)
    # Filter and clean
    result = []
    for s in sentences:
        s = s.strip()
        if len(s) >= min_length:
            result.append(s)
    return result


def levenshtein_distance(s1: str, s2: str) -> int:
    """Calculate Levenshtein distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def character_error_rate(hypothesis: str, reference: str) -> float:
    """Calculate Character Error Rate (CER)."""
    if len(reference) == 0:
        return 1.0 if len(hypothesis) > 0 else 0.0
    distance = levenshtein_distance(hypothesis, reference)
    return distance / len(reference)


def word_error_rate(hypothesis: str, reference: str) -> float:
    """Calculate Word Error Rate (WER)."""
    hyp_words = hypothesis.lower().split()
    ref_words = reference.lower().split()

    if len(ref_words) == 0:
        return 1.0 if len(hyp_words) > 0 else 0.0

    distance = levenshtein_distance(' '.join(hyp_words), ' '.join(ref_words))
    ref_length = len(' '.join(ref_words))
    return distance / ref_length if ref_length > 0 else 0.0


def find_matching_passage(needle: str, haystack: str, min_ratio: float = 0.6) -> Optional[str]:
    """Find the best matching passage in haystack for needle."""
    needle_clean = clean_text(needle).lower()
    needle_words = needle_clean.split()[:20]  # Use first 20 words for matching
    search_prefix = ' '.join(needle_words)

    haystack_clean = clean_text(haystack)

    # Sliding window search
    best_match = None
    best_ratio = min_ratio

    words = haystack_clean.split()
    window_size = len(needle_clean.split()) + 20  # Allow some flexibility

    for i in range(0, len(words) - 10, 5):  # Step by 5 words for efficiency
        window = ' '.join(words[i:i + window_size])
        ratio = SequenceMatcher(None, needle_clean[:200], window[:200].lower()).ratio()

        if ratio > best_ratio:
            best_ratio = ratio
            # Extend to capture full passage
            end_idx = min(i + window_size + 20, len(words))
            best_match = ' '.join(words[i:end_idx])

    return best_match


def evaluate_passage(ocr_text: str, ground_truth: str, use_correction: bool = True) -> dict:
    """Evaluate OCR quality for a passage."""
    # Clean texts
    ocr_clean = clean_text(ocr_text)
    gt_clean = clean_text(ground_truth)

    # Calculate baseline metrics
    baseline_cer = character_error_rate(ocr_clean, gt_clean)
    baseline_wer = word_error_rate(ocr_clean, gt_clean)

    result = {
        'baseline_cer': baseline_cer,
        'baseline_wer': baseline_wer,
        'corrected_cer': None,
        'corrected_wer': None,
        'cer_improvement': None,
        'wer_improvement': None,
    }

    if use_correction:
        # Apply correction
        corrected = apply_rules(ocr_text)
        corrected_clean = clean_text(corrected)

        corrected_cer = character_error_rate(corrected_clean, gt_clean)
        corrected_wer = word_error_rate(corrected_clean, gt_clean)

        result['corrected_cer'] = corrected_cer
        result['corrected_wer'] = corrected_wer
        result['cer_improvement'] = baseline_cer - corrected_cer
        result['wer_improvement'] = baseline_wer - corrected_wer
        result['corrected_text'] = corrected_clean[:500]  # Sample

    result['ocr_sample'] = ocr_clean[:500]
    result['gt_sample'] = gt_clean[:500]

    return result


# Known text pairs for evaluation
TEXT_PAIRS = [
    {
        'name': 'Descartes - Discourse on Method',
        'ocr': 'ia_output/Descartes 1637 Discourse on the Method of Rightly _Descartes1637DiscourseOnTheMethodTrVeitch1850_ocr.txt',
        'ground_truth': 'wikisource_output/Discourse on the Method_wikisource.txt',
    },
    {
        'name': 'Hooke - Micrographia',
        'ocr': 'ia_output/Micrographia or some physiological descriptions of_b30326370_ocr.txt',
        'ground_truth': 'wikisource_output/Micrographia_wikisource.txt',
    },
    {
        'name': 'Harvey - De Motu Cordis',
        'ocr': 'ia_output/Exercitatio anatomica de motv cordis et sangvinis _McGillLibrary-osl_exercitatio-anatomica_H342e1628-20157_ocr.txt',
        'ground_truth': 'wikisource_output/The Works of William HarveyAn Anatomical Disquisit_wikisource.txt',
    },
]


def count_error_patterns(text: str) -> dict:
    """Count known OCR error patterns in text."""
    patterns = {
        'long_s_f': r'\b[a-z]*f[aeiou][a-z]*\b',  # potential long-s as f
        'tli_errors': r'\btli[aeiou]',
        'vv_errors': r'\bvv',
        'che_for_the': r'\bche\b',
        'split_words': r'\b\w+\s\w+ment\b|\b\w+\s\w+tion\b',  # like "adj ustment"
    }

    counts = {}
    for name, pattern in patterns.items():
        matches = re.findall(pattern, text, re.IGNORECASE)
        counts[name] = len(matches)

    return counts


def evaluate_file_quality(filepath: Path) -> dict:
    """Evaluate OCR quality for a single file using heuristics."""
    text = filepath.read_text(encoding='utf-8', errors='ignore')

    # Skip boilerplate
    text = clean_text(text)

    total_words = len(text.split())

    # Apply correction
    corrected = apply_rules(text)

    # Count changes
    original_words = text.split()
    corrected_words = corrected.split()

    changes = sum(1 for a, b in zip(original_words, corrected_words) if a != b)

    # Estimate remaining errors (words that look suspicious)
    suspicious_patterns = [
        r'\b\w*f[aeiou][a-z]{2,}f\b',  # double f that might be long-s
        r'\b[A-Z][a-z]*f[a-z]+\b',  # Capital + f in middle (like "Philofophy")
        r'\btl[aeiou]',  # tli/tla errors
        r'\b\w+\s\w{1,3}\s\w+\b',  # potential split words
    ]

    remaining_suspicious = 0
    for pattern in suspicious_patterns:
        remaining_suspicious += len(re.findall(pattern, corrected))

    return {
        'filename': filepath.name,
        'total_words': total_words,
        'corrections_made': changes,
        'correction_rate': changes / total_words if total_words > 0 else 0,
        'remaining_suspicious': remaining_suspicious,
        'suspicious_rate': remaining_suspicious / total_words if total_words > 0 else 0,
    }


def evaluate_all_pairs():
    """Evaluate all known text pairs."""
    print("OCR Correction Evaluation")
    print("=" * 70)

    results = []

    # Evaluate OCR files directly (without ground truth alignment)
    print("\n📊 Direct OCR Quality Assessment")
    print("-" * 50)

    ocr_files = list(Path('ia_output').glob('*_ocr.txt'))

    for ocr_path in ocr_files:
        if not ocr_path.exists():
            continue

        result = evaluate_file_quality(ocr_path)
        results.append(result)

        print(f"\n📖 {result['filename'][:50]}...")
        print(f"   Words: {result['total_words']:,}")
        print(f"   Corrections made: {result['corrections_made']:,} ({result['correction_rate']:.1%})")
        print(f"   Remaining suspicious: {result['remaining_suspicious']:,} ({result['suspicious_rate']:.1%})")

        if result['correction_rate'] > 0.01:
            print(f"   ✓ Significant improvement from rule-based correction")
        elif result['correction_rate'] > 0:
            print(f"   → Some corrections applied")
        else:
            print(f"   → Text appears clean or uses different error patterns")

    # Now try ground truth comparison for available pairs
    print("\n\n📊 Ground Truth Comparison (where available)")
    print("-" * 50)

    for pair in TEXT_PAIRS:
        ocr_path = Path(pair['ocr'])
        gt_path = Path(pair['ground_truth'])

        if not ocr_path.exists() or not gt_path.exists():
            continue

        print(f"\n📖 {pair['name']}")

        ocr_text = ocr_path.read_text(encoding='utf-8', errors='ignore')
        gt_text = gt_path.read_text(encoding='utf-8', errors='ignore')

        # Extract sample passages from ground truth
        gt_sentences = extract_sentences(clean_text(gt_text), min_length=100)[:10]

        if not gt_sentences:
            print("  Could not extract comparison sentences")
            continue

        total_baseline_cer = 0
        total_corrected_cer = 0
        count = 0

        for gt_sentence in gt_sentences[:5]:
            ocr_match = find_matching_passage(gt_sentence, ocr_text)

            if ocr_match:
                eval_result = evaluate_passage(ocr_match, gt_sentence)

                if eval_result['baseline_cer'] < 0.8:
                    total_baseline_cer += eval_result['baseline_cer']
                    total_corrected_cer += eval_result['corrected_cer']
                    count += 1

        if count > 0:
            avg_baseline = total_baseline_cer / count
            avg_corrected = total_corrected_cer / count
            improvement = avg_baseline - avg_corrected

            print(f"   Passages evaluated: {count}")
            print(f"   Baseline CER:  {avg_baseline:.1%}")
            print(f"   Corrected CER: {avg_corrected:.1%}")
            print(f"   Improvement:   {improvement:+.1%}")
        else:
            print("   (Could not align passages - different editions/translations)")

    return results


def show_sample_comparison(ocr_path: str):
    """Show a sample comparison between OCR and corrected text."""
    path = Path(ocr_path)
    if not path.exists():
        print(f"File not found: {ocr_path}")
        return

    text = path.read_text(encoding='utf-8', errors='ignore')

    # Extract a substantial paragraph
    paragraphs = re.split(r'\n\s*\n', text)
    good_paragraphs = [p for p in paragraphs if 100 < len(p) < 1000]

    if not good_paragraphs:
        print("Could not find suitable paragraphs")
        return

    # Find one with potential OCR errors
    sample = None
    for p in good_paragraphs[5:15]:  # Skip early boilerplate
        if re.search(r'\bf[aiuo]', p) or re.search(r'\btli', p):  # Signs of OCR errors
            sample = p
            break

    if not sample:
        sample = good_paragraphs[min(10, len(good_paragraphs)-1)]

    print("ORIGINAL OCR:")
    print("-" * 60)
    print(sample.strip())
    print()

    corrected = apply_rules(sample)

    print("AFTER RULE-BASED CORRECTION:")
    print("-" * 60)
    print(corrected.strip())
    print()

    # Highlight changes
    orig_words = set(sample.lower().split())
    corr_words = set(corrected.lower().split())

    changed = orig_words.symmetric_difference(corr_words)
    if changed:
        print(f"Words changed: {len(changed)}")
        print(f"Sample changes: {list(changed)[:10]}")


def run_synthetic_tests():
    """Run tests with synthetic OCR errors to verify correction quality."""
    print("Synthetic OCR Error Tests")
    print("=" * 70)

    test_cases = [
        # (degraded OCR text, expected clean text, description)
        (
            "Good fenfe is, of all things among men, the moft equally diftributed",
            "Good sense is, of all things among men, the most equally distributed",
            "Long-s (ſ→f) correction"
        ),
        (
            "tlie underftanding of a macliine is not like tliat of a man",
            "the understanding of a machine is not like that of a man",
            "Mixed tli→th and long-s errors"
        ),
        (
            "vvhich is the fource of all our knowledge",
            "which is the source of all our knowledge",
            "vv→w and long-s"
        ),
        (
            "It feems impoffible that fuch reafoning fhould proceed from mere macliinery",
            "It seems impossible that such reasoning should proceed from mere machinery",
            "Multiple long-s and machine OCR"
        ),
        (
            "Babbagis calculating macliine performs adj ustments witli great fpeed",
            "Babbage's calculating machine performs adjustments with great speed",
            "Possessive, split word, tli errors"
        ),
    ]

    total_baseline_cer = 0
    total_corrected_cer = 0
    all_passed = True

    for degraded, expected, description in test_cases:
        print(f"\n{description}:")
        print(f"  Input:    {degraded}")

        corrected = apply_rules(degraded)
        print(f"  Output:   {corrected}")
        print(f"  Expected: {expected}")

        baseline_cer = character_error_rate(degraded, expected)
        corrected_cer = character_error_rate(corrected, expected)

        total_baseline_cer += baseline_cer
        total_corrected_cer += corrected_cer

        improvement = baseline_cer - corrected_cer

        if corrected.lower() == expected.lower():
            print(f"  ✓ Perfect match! (CER: {baseline_cer:.1%} → {corrected_cer:.1%})")
        elif corrected_cer < baseline_cer:
            print(f"  ~ Improved (CER: {baseline_cer:.1%} → {corrected_cer:.1%}, improvement: {improvement:+.1%})")
        else:
            print(f"  ✗ No improvement (CER: {baseline_cer:.1%} → {corrected_cer:.1%})")
            all_passed = False

    print("\n" + "=" * 70)
    n = len(test_cases)
    print(f"Average baseline CER:  {total_baseline_cer/n:.1%}")
    print(f"Average corrected CER: {total_corrected_cer/n:.1%}")
    print(f"Average improvement:   {(total_baseline_cer - total_corrected_cer)/n:+.1%}")

    return all_passed


def main():
    parser = argparse.ArgumentParser(description="OCR Evaluation and Testing")
    parser.add_argument('--test', action='store_true', help="Run synthetic tests")
    parser.add_argument('--evaluate', action='store_true', help="Evaluate all text pairs")
    parser.add_argument('--sample', help="Show sample comparison for a file")
    parser.add_argument('--json', action='store_true', help="Output results as JSON")

    args = parser.parse_args()

    if args.test:
        success = run_synthetic_tests()
        exit(0 if success else 1)
    elif args.evaluate:
        results = evaluate_all_pairs()
        if args.json:
            print(json.dumps(results, indent=2))
    elif args.sample:
        show_sample_comparison(args.sample)
    else:
        # Run both by default
        run_synthetic_tests()
        print("\n")
        evaluate_all_pairs()


if __name__ == "__main__":
    main()
