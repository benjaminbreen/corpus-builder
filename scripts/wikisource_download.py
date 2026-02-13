#!/usr/bin/env python3
"""
Wikisource Downloader - Download human-verified transcriptions of public domain texts.

Much better quality than OCR since these are manually transcribed and proofread.

Usage:
    python wikisource_download.py --url "https://en.wikisource.org/wiki/Discourse_on_the_Method"
    python wikisource_download.py --title "Discourse on the Method" --output ./output.txt

Requirements:
    pip install requests beautifulsoup4
"""

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

import requests
from bs4 import BeautifulSoup


class WikisourceDownloader:
    """Download texts from Wikisource using the MediaWiki API."""

    def __init__(self, lang: str = 'en'):
        self.lang = lang
        self.base_url = f"https://{lang}.wikisource.org"
        self.api_url = f"{self.base_url}/w/api.php"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'HistoricalCorpusBuilder/1.0 (Academic Research)'
        })

    def get_page_text(self, title: str) -> str:
        """Get the plain text content of a Wikisource page."""
        params = {
            'action': 'query',
            'titles': title,
            'prop': 'extracts',
            'explaintext': True,  # Get plain text, not HTML
            'format': 'json'
        }

        resp = self.session.get(self.api_url, params=params)
        resp.raise_for_status()
        data = resp.json()

        pages = data.get('query', {}).get('pages', {})
        for page_id, page_data in pages.items():
            if page_id == '-1':
                return None  # Page not found
            return page_data.get('extract', '')

        return None

    def get_page_html(self, title: str) -> str:
        """Get the HTML content of a Wikisource page (better formatting)."""
        params = {
            'action': 'parse',
            'page': title,
            'prop': 'text',
            'format': 'json',
            'disableeditsection': True,
            'disabletoc': True
        }

        resp = self.session.get(self.api_url, params=params)
        resp.raise_for_status()
        data = resp.json()

        if 'error' in data:
            return None

        return data.get('parse', {}).get('text', {}).get('*', '')

    def html_to_clean_text(self, html: str) -> str:
        """Convert Wikisource HTML to clean plain text."""
        soup = BeautifulSoup(html, 'html.parser')

        # Remove navigation, edit links, etc.
        for element in soup.find_all(['sup', 'span'], class_=['reference', 'mw-editsection']):
            element.decompose()

        # Remove any script or style tags
        for element in soup.find_all(['script', 'style']):
            element.decompose()

        # Handle poem/verse formatting
        for poem in soup.find_all('div', class_='poem'):
            # Preserve line breaks in poetry
            for br in poem.find_all('br'):
                br.replace_with('\n')

        # Get text
        text = soup.get_text(separator='\n')

        # Clean up
        lines = []
        for line in text.split('\n'):
            line = line.strip()
            if line:
                lines.append(line)

        # Join paragraphs (single newlines become spaces, double newlines preserved)
        result = []
        current_para = []

        for line in lines:
            # Check if this is a header or special line
            if line.startswith('←') or line.startswith('→'):
                # Navigation links - skip
                continue
            if re.match(r'^(Chapter|Part|Book|Section)\s+[IVXLC\d]+', line, re.IGNORECASE):
                # Chapter heading
                if current_para:
                    result.append(' '.join(current_para))
                    current_para = []
                result.append(f"\n\n{'='*40}\n{line}\n{'='*40}\n")
                continue

            current_para.append(line)

        if current_para:
            result.append(' '.join(current_para))

        return '\n\n'.join(result)

    def get_subpages(self, title: str) -> list[str]:
        """Get all subpages of a work (for multi-page books)."""
        params = {
            'action': 'query',
            'list': 'allpages',
            'apprefix': title + '/',
            'aplimit': 500,
            'format': 'json'
        }

        resp = self.session.get(self.api_url, params=params)
        resp.raise_for_status()
        data = resp.json()

        pages = data.get('query', {}).get('allpages', [])
        return [p['title'] for p in pages]

    def get_work_structure(self, title: str) -> dict:
        """Get the structure of a work (main page + subpages)."""
        # Get main page
        main_html = self.get_page_html(title)

        # Parse to find links to chapters/sections
        if main_html:
            soup = BeautifulSoup(main_html, 'html.parser')

            # Look for table of contents or chapter links
            chapters = []
            for link in soup.find_all('a', href=True):
                href = link.get('href', '')
                if href.startswith('/wiki/') and title.replace(' ', '_') in href:
                    chapter_title = unquote(href.replace('/wiki/', ''))
                    if chapter_title != title.replace(' ', '_'):
                        chapters.append({
                            'title': chapter_title,
                            'display': link.get_text().strip()
                        })

            # Deduplicate
            seen = set()
            unique_chapters = []
            for ch in chapters:
                if ch['title'] not in seen:
                    seen.add(ch['title'])
                    unique_chapters.append(ch)

            return {
                'main_title': title,
                'chapters': unique_chapters
            }

        return {'main_title': title, 'chapters': []}

    def download_work(self, title: str, output_dir: Path = None) -> str:
        """
        Download a complete work from Wikisource.

        Handles both single-page and multi-page works.
        """
        print(f"Fetching structure of: {title}")
        structure = self.get_work_structure(title)

        full_text = []
        had_content = False

        if structure['chapters']:
            print(f"Found {len(structure['chapters'])} chapters/sections")

            for i, chapter in enumerate(structure['chapters'], 1):
                print(f"  [{i}/{len(structure['chapters'])}] {chapter['display'][:50]}...")
                html = self.get_page_html(chapter['title'])
                if html:
                    text = self.html_to_clean_text(html)
                    if text.strip():
                        had_content = True
                    full_text.append(f"\n\n{'#'*60}\n# {chapter['display']}\n{'#'*60}\n\n{text}")
                else:
                    print(f"  ! Skipping missing chapter page: {chapter['title']}")
        else:
            # Single page work
            print("Downloading single page...")
            html = self.get_page_html(title)
            if html:
                text = self.html_to_clean_text(html)
                if text.strip():
                    had_content = True
                full_text.append(text)
            else:
                print(f"  ! Page not found: {title}")

        result = '\n'.join(full_text)

        # Save if output directory specified
        if output_dir and result.strip():
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            safe_title = re.sub(r'[^\w\s-]', '', title)[:50]
            output_file = output_dir / f"{safe_title}_wikisource.txt"
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(result)
            print(f"\nSaved to: {output_file}")
            print(f"Total characters: {len(result):,}")
        elif output_dir:
            print(f"\nNo content downloaded for '{title}'. No file written.")

        if not had_content:
            return ''

        return result

    def url_to_title(self, url: str) -> str:
        """Extract page title from a Wikisource URL."""
        parsed = urlparse(url)
        path = parsed.path
        if '/wiki/' in path:
            title = path.split('/wiki/')[-1]
            return unquote(title).replace('_', ' ')
        return None


def main():
    parser = argparse.ArgumentParser(
        description='Download texts from Wikisource',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Download by URL
    python wikisource_download.py --url "https://en.wikisource.org/wiki/Discourse_on_the_Method"

    # Download by title
    python wikisource_download.py --title "Discourse on the Method" --output ./wikisource_output

    # Search for works
    python wikisource_download.py --search "Descartes"
        """
    )
    parser.add_argument('--url', help='Wikisource URL')
    parser.add_argument('--title', help='Page title on Wikisource')
    parser.add_argument('--output', default='./wikisource_output', help='Output directory')
    parser.add_argument('--lang', default='en', help='Wikisource language (default: en)')
    parser.add_argument('--search', help='Search for works')

    args = parser.parse_args()

    downloader = WikisourceDownloader(lang=args.lang)

    if args.search:
        # Search functionality
        params = {
            'action': 'query',
            'list': 'search',
            'srsearch': args.search,
            'srnamespace': 0,  # Main namespace
            'srlimit': 20,
            'format': 'json'
        }
        resp = downloader.session.get(downloader.api_url, params=params)
        data = resp.json()

        results = data.get('query', {}).get('search', [])
        print(f"Found {len(results)} results for '{args.search}':\n")
        for r in results:
            print(f"  - {r['title']}")
            print(f"    {downloader.base_url}/wiki/{quote(r['title'].replace(' ', '_'))}")
            print()
        return

    # Get title from URL or argument
    title = None
    if args.url:
        title = downloader.url_to_title(args.url)
    elif args.title:
        title = args.title

    if not title:
        parser.print_help()
        sys.exit(1)

    # Download
    text = downloader.download_work(title, Path(args.output))

    # Show preview
    print("\n--- Preview (first 1000 chars) ---")
    print(text[:1000])


if __name__ == '__main__':
    main()
