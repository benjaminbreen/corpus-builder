'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface PagefindResult {
  id: string
  url: string
  meta: {
    title: string
  }
  excerpt: string
  filters: {
    year?: string[]
    decade?: string[]
    topic?: string[]
    language?: string[]
  }
}

interface PagefindSearchResult {
  results: Array<{
    id: string
    data: () => Promise<PagefindResult>
  }>
}

// Pagefind types
declare global {
  interface Window {
    pagefind?: {
      init: () => Promise<void>
      search: (query: string, options?: object) => Promise<PagefindSearchResult>
      filters: () => Promise<Record<string, Record<string, number>>>
    }
  }
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PagefindResult[]>([])
  const [loading, setLoading] = useState(false)
  const [pagefindLoaded, setPagefindLoaded] = useState(false)
  const [filters, setFilters] = useState<Record<string, Record<string, number>>>({})
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({})
  const [searchPerformed, setSearchPerformed] = useState(false)

  // Load Pagefind
  useEffect(() => {
    async function loadPagefind() {
      try {
        // Load Pagefind via script tag since it's in the public folder
        if (!window.pagefind) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = '/_pagefind/pagefind.js'
            script.type = 'module'
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('Failed to load Pagefind script'))
            document.head.appendChild(script)
          })
          // Give it a moment to initialize the global
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        if (window.pagefind) {
          await window.pagefind.init()
          const availableFilters = await window.pagefind.filters()
          setFilters(availableFilters)
          setPagefindLoaded(true)
        }
      } catch (e) {
        console.error('Failed to load Pagefind:', e)
      }
    }
    loadPagefind()
  }, [])

  // Perform search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!window.pagefind || !searchQuery.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    setSearchPerformed(true)

    try {
      // Build filter options
      const filterOptions: Record<string, string> = {}
      if (selectedFilters.decade) filterOptions.decade = selectedFilters.decade
      if (selectedFilters.topic) filterOptions.topic = selectedFilters.topic
      if (selectedFilters.language) filterOptions.language = selectedFilters.language

      const search = await window.pagefind.search(searchQuery, {
        filters: Object.keys(filterOptions).length > 0 ? filterOptions : undefined,
      })

      // Load result data
      const loadedResults = await Promise.all(
        search.results.slice(0, 50).map(async (r) => {
          const data = await r.data()
          return data
        })
      )

      setResults(loadedResults)
    } catch (e) {
      console.error('Search error:', e)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [selectedFilters])

  // Handle search on Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      performSearch(query)
    }
  }

  // Extract identifier from URL (filename without .html)
  const getIdentifier = (url: string) => {
    const match = url.match(/\/([^/]+)\.html$/)
    return match ? match[1] : ''
  }

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-8">
        <Link href="/" className="nav-link inline-flex items-center gap-1 mb-8">
          ← Back to Home
        </Link>

        <h1 className="mb-4">Search the Archive</h1>
        <p className="text-lg text-ink-600 max-w-2xl mb-8">
          Full-text search across four centuries of texts on cognition, automation, and the thinking machine.
        </p>

        {/* Search input */}
        <div className="max-w-2xl">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Search for "thinking machine", "mechanical brain", "automaton"...'
              className="input text-lg pr-24"
              autoFocus
            />
            <button
              onClick={() => performSearch(query)}
              disabled={!pagefindLoaded || loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-copper-600 text-paper-50 text-sm rounded-sm hover:bg-copper-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
          {!pagefindLoaded && (
            <p className="mt-3 text-sm text-ink-400">
              Loading search index...
            </p>
          )}
        </div>

        {/* Filters */}
        {pagefindLoaded && Object.keys(filters).length > 0 && (
          <div className="mt-6 flex flex-wrap gap-4">
            {filters.decade && Object.keys(filters.decade).length > 0 && (
              <div>
                <label className="meta-label block mb-1">Decade</label>
                <select
                  value={selectedFilters.decade || ''}
                  onChange={(e) => setSelectedFilters({ ...selectedFilters, decade: e.target.value })}
                  className="font-sans text-sm bg-paper-50 border border-paper-300 rounded-sm px-2 py-1"
                >
                  <option value="">All decades</option>
                  {Object.entries(filters.decade)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([decade, count]) => (
                      <option key={decade} value={decade}>
                        {decade} ({count})
                      </option>
                    ))}
                </select>
              </div>
            )}
            {filters.topic && Object.keys(filters.topic).length > 0 && (
              <div>
                <label className="meta-label block mb-1">Topic</label>
                <select
                  value={selectedFilters.topic || ''}
                  onChange={(e) => setSelectedFilters({ ...selectedFilters, topic: e.target.value })}
                  className="font-sans text-sm bg-paper-50 border border-paper-300 rounded-sm px-2 py-1"
                >
                  <option value="">All topics</option>
                  {Object.entries(filters.topic).map(([topic, count]) => (
                    <option key={topic} value={topic}>
                      {topic} ({count})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {filters.language && Object.keys(filters.language).length > 0 && (
              <div>
                <label className="meta-label block mb-1">Language</label>
                <select
                  value={selectedFilters.language || ''}
                  onChange={(e) => setSelectedFilters({ ...selectedFilters, language: e.target.value })}
                  className="font-sans text-sm bg-paper-50 border border-paper-300 rounded-sm px-2 py-1"
                >
                  <option value="">All languages</option>
                  {Object.entries(filters.language).map(([lang, count]) => (
                    <option key={lang} value={lang}>
                      {lang} ({count})
                    </option>
                  ))}
                </select>
              </div>
            )}
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

      {/* Search results */}
      <section className="container-content py-8">
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block w-6 h-6 border-2 border-copper-400 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-ink-400">Searching...</p>
          </div>
        ) : results.length > 0 ? (
          <div>
            <p className="text-sm text-ink-500 mb-6">
              Found {results.length} {results.length === 1 ? 'result' : 'results'} for "{query}"
            </p>
            <div className="space-y-6">
              {results.map((result) => {
                const identifier = getIdentifier(result.url)
                const year = result.filters?.year?.[0]
                return (
                  <Link
                    key={result.id}
                    href={`/document/${identifier}`}
                    className="block p-4 border border-paper-200 rounded-sm hover:border-copper-400 hover:bg-paper-50 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      {year && (
                        <span className="date-stamp shrink-0">{year}</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-serif text-base text-ink-900 mb-2 line-clamp-2">
                          {result.meta.title}
                        </h3>
                        <p
                          className="font-sans text-sm text-ink-600 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: result.excerpt }}
                        />
                        <div className="mt-2 flex gap-2">
                          {result.filters?.topic?.[0] && (
                            <span className="tag text-xs">{result.filters.topic[0]}</span>
                          )}
                          {result.filters?.language?.[0] && (
                            <span className="tag text-xs">{result.filters.language[0]}</span>
                          )}
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
            <p className="text-sm">
              Try different keywords or remove filters
            </p>
          </div>
        ) : (
          <div className="text-center py-16 text-ink-400">
            <p className="text-lg mb-2">Enter a search term above</p>
            <p className="text-sm">
              Search supports exact phrases in quotes, e.g. "thinking machines"
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
