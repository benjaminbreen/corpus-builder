#!/usr/bin/env python3
"""Look up an English Wikipedia name and thumbnail for each corpus creator.

Writes public/data/author-portraits.json, keyed by the raw creator string, so
search results can show author portraits without client-side lookups.
Only person articles are accepted; review the output by hand.
"""
import json
import re
import time
from pathlib import Path
from urllib.parse import quote

import requests

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'public' / 'data' / 'corpus-index.json'
OUT = ROOT / 'public' / 'data' / 'author-portraits.json'

session = requests.Session()
session.headers['User-Agent'] = 'GEMI-CorpusBuilder/1.0 (https://github.com/benjaminbreen/corpus-builder)'


def candidates(creator: str) -> list[str]:
    name = re.sub(r',?\s*\(?\d{4}\s*-\s*\d{0,4}\)?', '', creator)
    name = re.sub(r',?\s*(praeses|respondent|editor|former owner|printer)\b.*$', '', name, flags=re.I)
    name = name.strip(' ,.')
    parts = [p.strip() for p in name.split(',') if p.strip()]
    out = []
    if len(parts) >= 2:
        out.append(f'{parts[1]} {parts[0]}')
    out.append(name)
    return out


def lookup(title: str):
    url = f'https://en.wikipedia.org/api/rest_v1/page/summary/{quote(title)}'
    for attempt in range(6):
        r = session.get(url, timeout=30)
        if r.status_code != 429:
            break
        time.sleep(20 * (attempt + 1))
    if r.status_code != 200:
        return None
    data = r.json()
    if data.get('type') != 'standard':
        return None
    extract = data.get('extract', '')
    # Person articles open with life dates or "was a/an"
    if not re.search(r'\(\s*(born|c\.|\d{1,2} \w+ )?\s*\d{3,4}|\bwas an? ', extract[:300]):
        return None
    return {
        'name': data.get('title'),
        'thumbnail': (data.get('thumbnail') or {}).get('source'),
        'url': data.get('content_urls', {}).get('desktop', {}).get('page'),
    }


def main() -> None:
    docs = json.loads(INDEX.read_text())
    creators = sorted({str(d.get('creator') or '').strip() for d in docs} - {''})
    result = {}
    for creator in creators:
        if re.search(r'unknown|anonymous|review|magazine|journal|society|news|encyclop', creator, re.I):
            continue
        for title in candidates(creator):
            info = lookup(title)
            time.sleep(1.5)
            if info:
                result[creator] = info
                print(f'{creator!r:60} -> {info["name"]}{"" if info["thumbnail"] else "  (no image)"}')
                break
    OUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
