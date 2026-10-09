#!/usr/bin/env python3
"""Import selected psychology texts from the Jamesiana corpus into GEMI.

Jamesiana texts are hard-wrapped at ~70 columns; this reflows them into
paragraphs and, for The Principles of Psychology, extracts single chapters.

Usage:
    python scripts/import_jamesiana.py --source ~/Code/Jamesiana/texts
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'public' / 'data' / 'corpus-index.json'
RAW = ROOT / 'public' / 'raw_texts'

WORKS = [
    {
        'identifier': 'jamesiana_james_habit_1890',
        'file': 'principles_of_psychology_james_1890.txt',
        'chapter': ('HABIT.', 'THE AUTOMATON-THEORY.'),
        'title': 'The Principles of Psychology, Chapter IV: Habit',
        'year': 1890,
        'creator': 'William James',
        'topic': 'learning',
        'source_url': 'https://psychclassics.yorku.ca/James/Principles/prin4.htm',
        'description': 'James explains habit as the plasticity of nervous tissue, so that repeated action wears paths in the brain. An influential account of learning as physical change in a living system.',
    },
    {
        'identifier': 'jamesiana_james_automaton_theory_1890',
        'file': 'principles_of_psychology_james_1890.txt',
        'chapter': ('THE AUTOMATON-THEORY.', 'THE MIND-STUFF THEORY.'),
        'title': 'The Principles of Psychology, Chapter V: The Automaton-Theory',
        'year': 1890,
        'creator': 'William James',
        'topic': 'intelligence',
        'source_url': 'https://psychclassics.yorku.ca/James/Principles/prin5.htm',
        'description': 'James rejects the view (associated with Huxley and Clifford) that humans and animals are conscious automata whose minds do no causal work. A core text on whether thinking can be reduced to mechanism.',
    },
    {
        'identifier': 'jamesiana_spr_census_of_hallucinations_1894',
        'file': 'ghosts/spr_census_of_hallucinations_1894.txt',
        'title': 'Report on the Census of Hallucinations',
        'year': 1894,
        'creator': 'Society for Psychical Research (Sidgwick Committee)',
        'topic': 'intelligence',
        'source_url': None,
        'description': 'A statistical survey of 17,000 people on hallucinations among the sane, run with the backing of the International Congress of Experimental Psychology; William James led the American census. A key 19th-century attempt to define and count hallucination.',
    },
    {
        'identifier': 'jamesiana_cattell_mental_tests_1890',
        'file': 'ghosts/cattell_mental_tests_and_measurements_1890.txt',
        'title': 'Mental Tests and Measurements',
        'year': 1890,
        'creator': 'James McKeen Cattell',
        'topic': 'intelligence',
        'source_url': 'https://psychclassics.yorku.ca/Cattell/mental.htm',
        'description': 'The article that coined the term "mental test," proposing standardized measurements of reaction time, memory, and perception, with remarks by Francis Galton. A founding document in the measurement of intelligence.',
    },
    {
        'identifier': 'jamesiana_galton_psychometric_experiments_1879',
        'file': 'ghosts/galton_psychometric_experiments_1879.txt',
        'title': 'Psychometric Experiments',
        'year': 1879,
        'creator': 'Francis Galton',
        'topic': 'learning',
        'source_url': None,
        'description': 'Galton times his own word associations to study how ideas are linked and recalled, an early experiment in measuring the mechanics of memory and thought.',
    },
    {
        'identifier': 'jamesiana_galton_mental_imagery_1880',
        'file': 'ghosts/galton_statistics_of_mental_imagery_1880.txt',
        'title': 'Statistics of Mental Imagery',
        'year': 1880,
        'creator': 'Francis Galton',
        'topic': 'intelligence',
        'source_url': 'https://psychclassics.yorku.ca/Galton/imagery.htm',
        'description': 'A questionnaire study of how vividly people picture things in the mind, showing wide variation in inner experience. Early statistical psychology of representation.',
    },
    {
        'identifier': 'jamesiana_galton_human_faculty_1883',
        'file': 'ghosts/galton_inquiries_human_faculty_1883.txt',
        'title': 'Inquiries into Human Faculty and Its Development',
        'year': 1883,
        'creator': 'Francis Galton',
        'topic': 'intelligence',
        'source_url': 'https://galton.org/books/human-faculty/',
        'description': 'Galton\'s survey of mental differences, from imagery and association to measurement, which also introduced the word "eugenics." Central to how "intelligence" became something to be measured and ranked.',
    },
]


def reflow(text: str) -> str:
    text = text.replace('\r', '')
    text = re.sub(r'(\w)-\n(\w)', r'\1\2', text)  # rejoin hyphenated line breaks
    paras = []
    for block in re.split(r'\n\s*\n', text):
        line = re.sub(r'\s+', ' ', block).strip()
        if line:
            paras.append(line)
    return '\n\n'.join(paras)


def extract_chapter(text: str, start: str, end: str) -> str:
    lines = text.split('\n')
    begin = next(i for i, l in enumerate(lines) if l.strip() == start and i > 400)
    stop = next(i for i, l in enumerate(lines) if l.strip() == end and i > begin)
    # stop before the "CHAPTER N." heading that precedes the next title
    while stop > begin and not lines[stop - 1].strip().startswith('CHAPTER'):
        stop -= 1
    return '\n'.join(lines[begin:stop - 1])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True, type=Path)
    args = parser.parse_args()

    docs = json.loads(INDEX.read_text())
    existing = {d['identifier'] for d in docs}
    for work in WORKS:
        text = (args.source / work['file']).read_text(errors='ignore')
        if 'chapter' in work:
            text = extract_chapter(text, *work['chapter'])
        text = reflow(text)
        slug = work['identifier'].removeprefix('jamesiana_')
        filename = f"{work['year']}_en_{slug}.txt"
        (RAW / filename).write_text(text + '\n')
        entry = {
            'identifier': work['identifier'],
            'title': work['title'],
            'year': work['year'],
            'publication_year': None,
            'gutenberg_release_year': None,
            'year_source': None,
            'creator': work['creator'],
            'description': work['description'],
            'summary': work['description'],
            'topic': work['topic'],
            'language_code': 'en',
            'language': 'English',
            'source_url': work['source_url'],
            'char_count': len(text),
            'source': 'jamesiana',
            'filename': filename,
            'has_translation': False,
            'translation_filename': None,
            'gibberish_pages': [],
        }
        if work['identifier'] in existing:
            docs = [entry if d['identifier'] == work['identifier'] else d for d in docs]
        else:
            docs.append(entry)
        print(f"{work['identifier']}: {len(text):,} chars")
    INDEX.write_text(json.dumps(docs, indent=2) + '\n')


if __name__ == '__main__':
    main()
