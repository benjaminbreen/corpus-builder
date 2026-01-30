# Historical Corpus Builder

An AI-powered pipeline for building and analyzing historical text corpora from public domain archives.

## Project Overview

This project downloads OCR'd texts from Internet Archive (and potentially other public domain sources) on specific historical topics, then uses Claude to analyze patterns, trace concept evolution, and generate research insights.

**Current Focus:** History of automation, computing, and "thinking machines" (1850-1950)

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Data Sources   │ ──▶  │  Corpus Builder │ ──▶  │  Claude Analysis│
│                 │      │                 │      │                 │
│ • Internet      │      │ • Download      │      │ • Summarize     │
│   Archive       │      │ • OCR extract   │      │ • Trace concepts│
│ • HathiTrust    │      │ • Organize      │      │ • Find patterns │
│ • Chronicling   │      │ • Index         │      │ • Generate      │
│   America       │      │                 │      │   reports       │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

## Files

- `ia_historical_corpus.py` - Downloads and organizes texts from Internet Archive
- `analyze_corpus.py` - Claude-powered analysis of the downloaded corpus

## Setup

```bash
# Install dependencies
pip install internetarchive requests anthropic

# For Claude analysis
export ANTHROPIC_API_KEY=your_key_here
```

## Usage

### 1. Build the Corpus

```bash
python ia_historical_corpus.py
```

This will:
- Search Internet Archive for configured topics
- Download OCR'd text files (1850-1950 date range)
- Organize into `corpus/` directory by decade and topic
- Create `corpus/metadata.json` index

**Output structure:**
```
corpus/
├── metadata.json          # Index of all items
├── raw_texts/             # All downloaded texts
├── by_decade/
│   ├── 1850s/
│   ├── 1860s/
│   └── ...
└── by_topic/
    ├── calculating_machines/
    ├── automata/
    ├── thinking_machines/
    └── ...
```

### 2. Analyze with Claude

```bash
python analyze_corpus.py
```

Interactive menu with options:
1. **Analyze single document** - Deep analysis of one text
2. **Trace concept evolution** - How a term/concept changed over time
3. **Decade summary** - Synthesize themes from a particular decade
4. **Find cross-references** - Discover connections between documents
5. **Batch analyze** - Process entire corpus (expensive)

## Configuration

Edit `ia_historical_corpus.py` to customize:

```python
SEARCH_TOPICS = {
    "calculating_machines": ["calculating machine", "difference engine", ...],
    "automata": ["automaton", "mechanical man", ...],
    # Add your own topics here
}

START_YEAR = 1850
END_YEAR = 1950
MAX_ITEMS_PER_TERM = 50
```

## Potential Enhancements

- [ ] Add more data sources (HathiTrust, Google Books, Chronicling America)
- [ ] Implement semantic search with embeddings
- [ ] Build a web interface for browsing/searching corpus
- [ ] Add named entity extraction (people, places, inventions)
- [ ] Timeline visualization of concepts
- [ ] Citation network analysis
- [ ] Export to Zotero/reference manager format

## Data Sources

### Currently Implemented
- **Internet Archive** (archive.org) - Millions of public domain texts, good API

### Potential Additions
- **HathiTrust** - Academic digitization project, API available
- **Chronicling America** - Library of Congress historical newspapers
- **Biodiversity Heritage Library** - Scientific publications
- **Project Gutenberg** - Classic texts
- **Google Books** - Public domain section

## Notes for Development

- Internet Archive rate limits: ~1 request/second is safe
- Many IA items already have OCR (`_djvu.txt` files)
- Pre-1928 US publications are generally public domain
- The `internetarchive` Python library is well-documented
- Claude API costs: ~$3/million input tokens, $15/million output tokens

## Research Questions This Could Address

1. How did the concept of "thinking machines" evolve from mechanical automata to electronic computers?
2. What metaphors were used to describe computation before the computer age?
3. Who were the key figures in early automation discourse?
4. How did public attitudes toward automation change across decades?
5. What predictions about computing came true vs. proved wrong?

---

*Project created for historical research on computing and automation.*
