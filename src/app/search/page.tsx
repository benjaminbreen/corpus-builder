'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { extractHighlightTerms, findTextHits, renderTextWithHighlights } from '@/lib/highlight'

interface SearchResult {
  doc_id: string
  chunk_id: string
  start_char: number
  end_char: number
  score: number
  semantic_score: number
  lexical_score: number
  quality_prior: number
  quality_percentile: number
  text: string
  title?: string
  year?: number
  topic?: string
  language_code?: string
}

interface SearchPayload {
  query: string
  model: string
  used_semantic: boolean
  total_candidates: number
  results: SearchResult[]
}

interface CorpusDocLite {
  year: number
  topic?: string
  language_code?: string
}

interface FilterCounts {
  decade: Record<string, number>
  topic: Record<string, number>
  language: Record<string, number>
}

function buildFilterCounts(docs: CorpusDocLite[]): FilterCounts {
  const counts: FilterCounts = {
    decade: {},
    topic: {},
    language: {},
  }

  for (const doc of docs) {
    const year = Number(doc.year)
    if (Number.isFinite(year)) {
      const decade = `${Math.floor(year / 10) * 10}s`
      counts.decade[decade] = (counts.decade[decade] || 0) + 1
    }

    const topic = doc.topic || 'unknown'
    counts.topic[topic] = (counts.topic[topic] || 0) + 1

    const language = doc.language_code || 'unknown'
    counts.language[language] = (counts.language[language] || 0) + 1
  }

  return counts
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchPerformed, setSearchPerformed] = useState(false)
  const [filters, setFilters] = useState<FilterCounts>({ decade: {}, topic: {}, language: {} })
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({})
  const [includeLowQuality, setIncludeLowQuality] = useState(false)
  const [searchMeta, setSearchMeta] = useState<{ model?: string; usedSemantic?: boolean; totalCandidates?: number }>({})

  useEffect(() => {
    async function loadFilterCounts() {
      try {
        const response = await fetch('/data/corpus-index.json')
        if (!response.ok) return
        const docs = (await response.json()) as CorpusDocLite[]
        setFilters(buildFilterCounts(docs))
      } catch {
        // Ignore filter-load errors and keep empty filters.
      }
    }

    loadFilterCounts()
  }, [])

  const performSearch = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setError(null)
      setSearchPerformed(false)
      setActiveQuery('')
      return
    }

    setLoading(true)
    setError(null)
    setSearchPerformed(true)
    setActiveQuery(trimmed)

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          k: 50,
          maxPerDoc: 2,
          includeLowQuality,
          filters: {
            decade: selectedFilters.decade || undefined,
            topic: selectedFilters.topic || undefined,
            language: selectedFilters.language || undefined,
          },
        }),
      })

      const data = (await response.json()) as SearchPayload & { error?: string }
      if (!response.ok) {
        throw new Error(data.error || `Search failed: ${response.status}`)
      }

      setResults(data.results || [])
      setSearchMeta({
        model: data.model,
        usedSemantic: data.used_semantic,
        totalCandidates: data.total_candidates,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
      setSearchMeta({})
    } finally {
      setLoading(false)
    }
  }, [includeLowQuality, query, selectedFilters.decade, selectedFilters.language, selectedFilters.topic])

  const sortedDecades = useMemo(
    () => Object.entries(filters.decade).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })),
    [filters.decade],
  )
  const highlightTerms = useMemo(() => extractHighlightTerms(activeQuery), [activeQuery])

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-8">
        <Link href="/" className="nav-link inline-flex items-center gap-1 mb-8">
          ← Back to Home
        </Link>

        <h1 className="mb-4">Search the Archive</h1>
        <p className="text-lg text-ink-600 max-w-2xl mb-8">
          Unified lexical + semantic search across four centuries of writing on cognition, automation, and machine intelligence.
        </p>

        <div className="max-w-3xl">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && performSearch()}
              placeholder='Try: "mechanical reasoning", "learning in machines", "probability"'
              className="input text-lg pr-24"
              autoFocus
            />
            <button
              onClick={performSearch}
              disabled={loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-copper-600 text-paper-50 text-sm rounded-sm hover:bg-copper-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2 text-ink-600">
              <input
                type="checkbox"
                checked={includeLowQuality}
                onChange={(event) => setIncludeLowQuality(event.target.checked)}
                className="rounded border-paper-300"
              />
              Include lowest-quality 10% of texts
            </label>
            <Link href="/methods" className="nav-link">
              Methods & limits →
            </Link>
          </div>
        </div>

        {Object.keys(filters.decade).length > 0 && (
          <div className="mt-6 flex flex-wrap gap-4">
            <div>
              <label className="meta-label block mb-1">Decade</label>
              <select
                value={selectedFilters.decade || ''}
                onChange={(event) => setSelectedFilters((prev) => ({ ...prev, decade: event.target.value }))}
                className="font-sans text-sm bg-paper-50 border border-paper-300 rounded-sm px-2 py-1"
              >
                <option value="">All decades</option>
                {sortedDecades.map(([decade, count]) => (
                  <option key={decade} value={decade}>
                    {decade} ({count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="meta-label block mb-1">Topic</label>
              <select
                value={selectedFilters.topic || ''}
                onChange={(event) => setSelectedFilters((prev) => ({ ...prev, topic: event.target.value }))}
                className="font-sans text-sm bg-paper-50 border border-paper-300 rounded-sm px-2 py-1"
              >
                <option value="">All topics</option>
                {Object.entries(filters.topic)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([topic, count]) => (
                    <option key={topic} value={topic}>
                      {topic} ({count})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="meta-label block mb-1">Language</label>
              <select
                value={selectedFilters.language || ''}
                onChange={(event) => setSelectedFilters((prev) => ({ ...prev, language: event.target.value }))}
                className="font-sans text-sm bg-paper-50 border border-paper-300 rounded-sm px-2 py-1"
              >
                <option value="">All languages</option>
                {Object.entries(filters.language)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([language, count]) => (
                    <option key={language} value={language}>
                      {language} ({count})
                    </option>
                  ))}
              </select>
            </div>

            {(selectedFilters.decade || selectedFilters.topic || selectedFilters.language) && (
              <button
                onClick={() => setSelectedFilters({})}
                className="self-end text-sm text-copper-700 hover:underline mb-1"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>

      <div className="rule" />

      <section className="container-content py-8">
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block w-6 h-6 border-2 border-copper-400 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-ink-400">Searching...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-sm p-4 text-sm text-red-700">{error}</div>
        ) : results.length > 0 ? (
          <div>
            <p className="text-sm text-ink-500 mb-6">
              Found {results.length} results for "{activeQuery}".
              {searchMeta.model && <span> Model: {searchMeta.model}.</span>}
              {searchMeta.totalCandidates !== undefined && <span> Candidates scored: {searchMeta.totalCandidates}.</span>}
              {searchMeta.usedSemantic === false && <span> Semantic fallback unavailable; lexical + quality ranking used.</span>}
            </p>
            <div className="space-y-5">
              {results.map((result) => {
                const snippetHits = findTextHits(result.text, highlightTerms, { maxHits: 24 })
                return (
                  <Link
                    key={result.chunk_id}
                    href={{
                      pathname: `/document/${result.doc_id}`,
                      query: {
                        q: activeQuery,
                        start: String(result.start_char),
                        end: String(result.end_char),
                      },
                    }}
                    className="block p-4 border border-paper-200 rounded-sm hover:border-copper-400 hover:bg-paper-50 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      {result.year && <span className="date-stamp shrink-0">{result.year}</span>}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-serif text-base text-ink-900 mb-2 line-clamp-2">{result.title || result.doc_id}</h3>
                        <p className="font-sans text-sm text-ink-700 leading-relaxed">
                          {renderTextWithHighlights(result.text, snippetHits, {
                            className: 'search-highlight',
                            activeClassName: '',
                          })}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {result.topic && <span className="tag text-xs">{result.topic}</span>}
                          {result.language_code && <span className="tag text-xs">{result.language_code}</span>}
                          <span className="tag text-xs">score {result.score.toFixed(3)}</span>
                          <span className="tag text-xs">lex {result.lexical_score.toFixed(2)}</span>
                          <span className="tag text-xs">sem {result.semantic_score.toFixed(2)}</span>
                          <span className="tag text-xs">quality {Math.round(result.quality_prior * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ) : searchPerformed ? (
          <div className="text-center py-16 text-ink-400">
            <p className="text-lg mb-2">No results found</p>
            <p className="text-sm">Try broader language, decade, or topic filters.</p>
          </div>
        ) : (
          <div className="text-center py-16 text-ink-400">
            <p className="text-lg mb-2">Enter a search term above</p>
            <p className="text-sm">Unified ranking blends lexical signals, semantic similarity, and source quality.</p>
          </div>
        )}
      </section>
    </div>
  )
}
