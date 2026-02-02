# GEMI: Genealogies of Engines, Machines, and Intelligences

## Project Overview

**Principal Investigators:** Benjamin Breen & Pranav Anand
**Institution:** UC Santa Cruz
**Funded by:** NEH
**Duration:** 4 years

GEMI is a digital archive and research infrastructure for recovering the "prehistory of AI" — the centuries of debate about cognition, automation, and thinking machines that preceded contemporary AI discourse. The project addresses what Philip Agre called "formalization as social forgetting": when AI researchers speak of systems as "reasoning" or "learning," they unconsciously reference centuries of philosophical debate while treating these terms as purely technical.

### Core Research Questions

1. How have terms like *intelligence*, *learning*, *reasoning*, *automation*, and *agency* shifted meaning as they migrated across disciplines?
2. What metaphorical frameworks shaped how we imagined thinking machines — from automata to "commutating switch-boards" to cybernetic systems?
3. How have debates about machine intelligence intersected with conceptions of human, animal, and more-than-human cognition?
4. How did pre-computer speculative exercises in fiction, philosophy, and religious studies shape understandings of non-human cognitive agents?
5. What can the history of statistics (from Galton's "regression" to modern ML) reveal about the ideological freight carried by contemporary AI?

### Yearly Thematic Focus

| Year | Theme | Key Terms |
|------|-------|-----------|
| Y1 | Order & Entropy | rules, randomness, distribution, probability, chance |
| Y2 | Mechanisms & Minds | engine, machine, intelligence, automaton, mechanism |
| Y3 | Learning/Memory | learning, reproduction, generativity, memory, habit |
| Y4 | Atoms/Networks | singularity, network, web, connection, emergence |

---

## Existing Infrastructure

This repository contains the prototype infrastructure for GEMI, developed during preliminary research.

### `ia_historical_corpus.py` — Corpus Builder

**Purpose:** Automatically downloads OCR'd texts from Internet Archive for specified date ranges and search terms across multiple languages.

**Current Configuration:**
- **Date range:** 1600-2000 (400 years of intellectual history)
- **Languages:** English, French, German, Russian, Spanish, Italian
- **Topics:** calculating_machines, automata, thinking_machines, computing, cybernetics, automation, intelligence, learning, mechanism, statistics_probability
- **Output:** Organized by decade, topic, AND language with full metadata indexing

**CLI Usage:**
```bash
# Download all languages and topics (full run)
python ia_historical_corpus.py

# Specific languages only
python ia_historical_corpus.py -l en fr de

# Specific topics only
python ia_historical_corpus.py -t automata mechanism

# Combined filters
python ia_historical_corpus.py -l en -t intelligence learning

# View corpus statistics
python ia_historical_corpus.py --stats

# List available topics and languages
python ia_historical_corpus.py --list
```

**Directory Structure:**
```
corpus/
├── metadata.json           # Full index of all items
├── raw_texts/              # All downloaded texts
├── by_decade/              # Symlinks: 1600s/, 1610s/, ... 2000s/
├── by_topic/               # Symlinks: automata/, intelligence/, etc.
└── by_language/            # Symlinks: en/, fr/, de/, ru/, es/, it/
```

**How it connects to GEMI:**
- This script is the foundation of the **data acquisition pipeline**
- The modular topic/term structure maps directly to the yearly thematic approach
- Metadata tracking (year, creator, language, description, subject) supports the archive's multiple access modes
- Multilingual search terms enable cross-linguistic concept tracking

**Future expansion (other archives):**
- [ ] Add HathiTrust integration for broader coverage
- [ ] Implement Europeana API for European sources
- [ ] Add Google Books/DPLA for US sources

### `analyze_corpus.py` — AI Analysis Engine

**Purpose:** Interactive CLI for Claude-powered analysis of the corpus.

**Current Capabilities:**
1. **Single Document Analysis** — Summary, key concepts, historical context, notable quotes
2. **Concept Evolution Tracing** — Track semantic shifts of terms across time
3. **Decade Summaries** — Synthesize themes from specific periods
4. **Cross-Reference Detection** — Find intellectual networks and citations
5. **Batch Analysis** — Process entire corpus

**How it connects to GEMI:**
- The **concept evolution tracing** directly supports the grant's goal of showing how terms "stretched and shifted across time, genre, and language"
- Analysis outputs become the basis for **thematic pathways** in the public interface
- Cross-reference detection maps **intellectual networks** for visualization

---

## Proposed Agent Architecture

To scale from prototype to full GEMI archive, we propose the following multi-agent system:

```
┌─────────────────────────────────────────────────────────────────┐
│                      GEMI AGENT SYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  HARVESTER  │  │  HARVESTER  │  │  HARVESTER  │             │
│  │  (Archive)  │  │ (HathiTrust)│  │ (Europeana) │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │    CORPUS MANAGER     │                          │
│              │  (dedup, normalize,   │                          │
│              │   metadata enrichment)│                          │
│              └───────────┬───────────┘                          │
│                          │                                      │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   ANALYST   │  │  ANNOTATOR  │  │ TRANSLATOR  │             │
│  │  (Claude)   │  │  (labeling) │  │ (multiLang) │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │   KNOWLEDGE GRAPH     │                          │
│              │  (terms, connections, │                          │
│              │   temporal evolution) │                          │
│              └───────────┬───────────┘                          │
│                          │                                      │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │    PUBLIC INTERFACE   │                          │
│              │  (search, browse,     │                          │
│              │   visualize, teach)   │                          │
│              └───────────────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Descriptions

#### 1. Harvester Agents
**File:** `agents/harvester_*.py`

Multiple specialized harvesters for different source archives:
- `harvester_ia.py` — Internet Archive (extends current `ia_historical_corpus.py`)
- `harvester_hathi.py` — HathiTrust digital library
- `harvester_europeana.py` — European cultural heritage
- `harvester_patents.py` — Historical patent databases
- `harvester_newspapers.py` — Historical newspaper archives

Each harvester implements a common interface:
```python
class BaseHarvester:
    def search(self, terms: list[str], date_range: tuple, language: str) -> list[SearchResult]
    def download(self, item_id: str) -> Document
    def extract_text(self, document: Document) -> str
```

#### 2. Corpus Manager Agent
**File:** `agents/corpus_manager.py`

Coordinates ingestion from all harvesters:
- Deduplication across sources
- Metadata normalization to common schema
- Language detection and tagging
- Quality scoring (OCR confidence, completeness)
- Storage and indexing

#### 3. Analyst Agent
**File:** `agents/analyst.py` (extends current `analyze_corpus.py`)

Claude-powered deep analysis:
- Document summarization
- Key term extraction with context
- Temporal concept tracking
- Network analysis (who cites whom, idea propagation)
- Thematic clustering

**New capabilities for GEMI:**
- Metaphor detection and classification
- Disciplinary boundary tracking (philosophy → psychology → cognitive science → CS)
- Counterfactual analysis ("what did they get wrong?")

#### 4. Annotator Agent
**File:** `agents/annotator.py`

Supports the student research fellowship workflow:
- Term labeling interface (mark instances with usage category)
- Annotation schema management
- Quality control for student annotations
- Training data generation for fine-tuning

#### 5. Translator Agent
**File:** `agents/translator.py`

Multilingual support (French, German, Russian):
- Full document translation for cross-linguistic analysis
- Term alignment across languages
- Etymology tracking

#### 6. Knowledge Graph Agent
**File:** `agents/knowledge_graph.py`

Builds and maintains the conceptual graph:
- Nodes: terms, people, works, institutions
- Edges: influence, citation, semantic relation, temporal sequence
- Supports queries like: "Show how 'learning' changed meaning from 1750-1950"

#### 7. Interface Agent
**File:** `agents/interface.py`

Powers the public GEMI website:
- Full-text search with faceting
- Chronological browsing
- Thematic pathways (curated journeys through the archive)
- Interactive visualizations (term evolution, network graphs)
- Pedagogical activity hosting

---

## Implementation Roadmap

### Phase 1: Foundation (Months 1-6)
*Extends existing scripts*

- [x] Expand `ia_historical_corpus.py` date range to 1600-2000
- [x] Add multilingual support (EN, FR, DE, RU, ES, IT)
- [x] Add Y1 theme terms (statistics_probability: order, entropy, randomness, distribution, probability)
- [x] Add core conceptual terms (intelligence, learning, mechanism)
- [ ] Implement HathiTrust harvester
- [ ] Set up PostgreSQL database for metadata
- [ ] Create common Document schema

### Phase 2: Analysis Pipeline (Months 7-12)
*Builds on `analyze_corpus.py`*

- [ ] Implement batch concept evolution tracking
- [ ] Add metaphor detection prompts
- [ ] Build knowledge graph foundation (Neo4j or similar)
- [ ] Create annotation interface for student researchers
- [ ] First visualization prototypes

### Phase 3: Multilingual Expansion (Months 13-18)
*Y2 theme: Mechanisms & Minds*

- [ ] Europeana harvester (French, German sources)
- [ ] Translation pipeline
- [ ] Cross-linguistic term alignment
- [ ] Expand search terms for Y2 theme

### Phase 4: Public Interface (Months 19-24)
*Y2-3 boundary*

- [ ] Web interface (Next.js or similar)
- [ ] Search and browse functionality
- [ ] First thematic pathway: "From Automata to AI"
- [ ] Field-testing in PI courses

### Phase 5: Pedagogical Integration (Months 25-36)
*Y3: Learning/Memory*

- [ ] Student annotation workflow
- [ ] Annotated reader compilation
- [ ] Interactive pedagogical activities
- [ ] Y3 term expansion

### Phase 6: Completion (Months 37-48)
*Y4: Atoms/Networks*

- [ ] Y4 term expansion
- [ ] Final visualizations
- [ ] Conference presentation materials
- [ ] Long-term sustainability plan

---

## Technical Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Data harvesting | Python, aiohttp | Async for parallel downloading |
| Text storage | PostgreSQL + full-text search | Or Elasticsearch for scale |
| Document storage | S3-compatible object storage | For raw texts |
| AI analysis | Claude API (Anthropic) | Via `anthropic` Python SDK |
| Knowledge graph | Neo4j | For relationship queries |
| Web interface | Next.js + React | Static generation where possible |
| Visualization | D3.js, Observable | Interactive term evolution |
| Hosting | Vercel + AWS | Or university infrastructure |

---

## Connection to Grant Deliverables

| Grant Deliverable | Implementation Component |
|-------------------|--------------------------|
| GEMI Digital Archive | Full system above |
| Full-text search | PostgreSQL FTS + Interface Agent |
| Chronological browsing | Corpus Manager + Interface |
| Thematic pathways | Analyst Agent + curated content |
| Interactive visualizations | Knowledge Graph + D3.js |
| Student research training | Annotator Agent + workflow |
| Pedagogical activities | Interface Agent + activity modules |
| Multilingual support | Translator Agent + Europeana harvester |

---

## Next Steps

1. **Immediate:** Test the expanded corpus builder:
   ```bash
   # Quick test with one language, one topic
   python ia_historical_corpus.py -l en -t automata --max-per-term 5

   # Check what was downloaded
   python ia_historical_corpus.py --stats
   ```
2. **This week:** Run full English corpus collection, then expand to other languages
3. **This month:** Evaluate corpus coverage gaps; adjust search terms as needed
4. **Q1:** Design common Document schema for multi-source integration; begin HathiTrust integration

---

## Repository Structure (Proposed)

```
historical-corpus-builder/
├── README.md
├── agents.md                    # This file
├── requirements.txt
├── config/
│   ├── search_terms.yaml        # Organized by year/theme
│   └── sources.yaml             # Archive API configurations
├── agents/
│   ├── __init__.py
│   ├── base.py                  # Common interfaces
│   ├── harvester_ia.py          # Internet Archive
│   ├── harvester_hathi.py       # HathiTrust
│   ├── harvester_europeana.py   # Europeana
│   ├── corpus_manager.py        # Dedup, normalize, store
│   ├── analyst.py               # Claude analysis
│   ├── annotator.py             # Labeling interface
│   ├── translator.py            # Multilingual
│   └── knowledge_graph.py       # Graph construction
├── schemas/
│   ├── document.py              # Common document model
│   └── annotation.py            # Annotation schema
├── scripts/
│   ├── ia_historical_corpus.py  # Current script (legacy)
│   └── analyze_corpus.py        # Current script (legacy)
├── web/                         # Public interface (future)
├── corpus/                      # Downloaded texts (gitignored)
└── analysis_output/             # Analysis results (gitignored)
```

---

## Contact

**Benjamin Breen** — PI, Digital Methods, History of Science
**Pranav Anand** — Co-PI, Corpus Linguistics, THI Faculty Director

*GEMI: Recovering the forgotten genealogies of artificial intelligence.*
