#!/usr/bin/env python3
"""Re-fetch Wikisource texts with paragraph breaks, dropping header templates and page markers.

Earlier downloads flattened each text to a single line and kept the Wikisource
metadata header (e.g. German "Textdaten" tables). This rebuilds public/raw_texts
for wikisource documents from rendered HTML.

Requirements:
    pip install requests beautifulsoup4
"""
import json
import re
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'public' / 'data' / 'corpus-index.json'
RAW = ROOT / 'public' / 'raw_texts'

REMOVE = [
    '#headertemplate', '.ws-header', '.header_notes', '.ws-noexport', '.noprint',
    '.pagenum', '.ws-pagenum', '.mw-editsection', 'style', 'script', '.reference',
    '.mw-references-wrap', '.references', '.mw-empty-elt', '.licenseContainer',
    'table.toccolours',
]
# Previously stored with the translator's notes appended; the notes are their own document
ALLOW_SHORTER = {'wikisource_sketch_analytical_engine'}

BLOCKS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'dd', 'blockquote', 'pre', 'tr']

session = requests.Session()
session.headers['User-Agent'] = 'GEMI-CorpusBuilder/1.0 (UC Santa Cruz academic research)'


def fetch_html(url: str) -> str:
    parsed = urlparse(url)
    title = unquote(parsed.path.split('/wiki/', 1)[1])
    api = f'{parsed.scheme}://{parsed.netloc}/w/api.php'
    params = {'action': 'parse', 'page': title, 'prop': 'text',
              'format': 'json', 'formatversion': 2, 'redirects': 1}
    for attempt in range(5):
        r = session.get(api, params=params, timeout=60)
        if r.status_code != 429:
            break
        time.sleep(15 * (attempt + 1))
    r.raise_for_status()
    return r.json()['parse']['text']


def mathml_to_text(el) -> str:
    if isinstance(el, str):
        return el.strip()
    parts = [mathml_to_text(c) for c in el.children]
    parts = [p for p in parts if p]
    name = el.name or ''
    if name in ('msup', 'msub') and len(parts) >= 2:
        op = '^' if name == 'msup' else '_'
        exp = parts[1] if len(parts[1]) == 1 else f'({parts[1]})'
        return f'{parts[0]}{op}{exp}'
    if name == 'msubsup' and len(parts) >= 3:
        return f'{parts[0]}_{parts[1]}^{parts[2]}'
    if name == 'mfrac' and len(parts) >= 2:
        return f'({parts[0]})/({parts[1]})'
    if name == 'msqrt':
        return f'√({"".join(parts)})'
    if name == 'annotation':
        return ''
    return ' '.join(parts) if name == 'mrow' and any(len(p) > 1 for p in parts) else ''.join(parts)


def html_to_paragraphs(html: str) -> str:
    soup = BeautifulSoup(html, 'html.parser')
    for br in soup.find_all('br'):
        br.replace_with(' ')
    for sel in REMOVE:
        for el in soup.select(sel):
            el.decompose()
    # German Wikisource puts its metadata in a "Textdaten" table
    for table in soup.find_all('table'):
        head = table.get_text(' ')[:300]
        if 'Textdaten' in head or 'Autor:' in head:
            table.decompose()
    # Wikisource serves equations as MathML; linearize them (x^2, u_z, a/b)
    for math in soup.find_all('math'):
        math.replace_with(f' {mathml_to_text(math)} ')
    # Mark block boundaries, then take all text so nothing outside <p> is lost
    for el in soup.find_all(BLOCKS + ['div', 'table', 'dl', 'ul', 'ol']):
        el.insert_before('\n\n')
        el.insert_after('\n\n')
    paras = []
    for chunk in re.split(r'\n\s*\n', soup.get_text('')):
        text = re.sub(r'\s+', ' ', chunk).strip()
        text = re.sub(r'\[\s*\d+\s*\]', '', text).strip()  # leftover page markers
        text = re.sub(r'\s+([,.;:!?])', r'\1', text)
        if text:
            paras.append(text)
    return '\n\n'.join(paras)


def main() -> None:
    docs = json.loads(INDEX.read_text())
    for doc in docs:
        if doc.get('source') != 'wikisource' or not doc.get('source_url'):
            continue
        path = RAW / doc['filename']
        old = path.read_text(errors='ignore') if path.exists() else ''
        try:
            new = html_to_paragraphs(fetch_html(doc['source_url']))
        except Exception as exc:  # keep the existing text on any failure
            print(f'SKIP {doc["identifier"]}: {exc}')
            continue
        finally:
            time.sleep(3)
        if len(new) < 0.5 * len(old) and doc['identifier'] not in ALLOW_SHORTER:
            print(f'KEEP {doc["identifier"]}: new text too short ({len(new)} vs {len(old)})')
            continue
        path.write_text(new + '\n')
        doc['char_count'] = len(new)
        print(f'OK   {doc["identifier"]}: {len(old)} -> {len(new)} chars, {new.count(chr(10) * 2) + 1} paragraphs')
    INDEX.write_text(json.dumps(docs, indent=2) + '\n')


if __name__ == '__main__':
    main()
