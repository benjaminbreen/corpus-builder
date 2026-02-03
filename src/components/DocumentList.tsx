'use client'

import { useState, useMemo } from 'react'
import { DocumentCard } from './DocumentCard'
import { Document, LANGUAGE_NAMES, TOPIC_NAMES } from '@/lib/types'

type SortOption = 'year-asc' | 'year-desc' | 'title' | 'size'

interface DocumentListProps {
  documents: Document[]
  showFilters?: boolean
  showSort?: boolean
  initialSort?: SortOption
  emptyMessage?: string
  variant?: 'default' | 'compact' | 'featured'
  showTopic?: boolean
  showLanguage?: boolean
}

export function DocumentList({
  documents,
  showFilters = false,
  showSort = true,
  initialSort = 'year-asc',
  emptyMessage = 'No documents found.',
  variant = 'default',
  showTopic = true,
  showLanguage = true,
}: DocumentListProps) {
  const [sortBy, setSortBy] = useState<SortOption>(initialSort)
  const [filterLanguage, setFilterLanguage] = useState<string>('')
  const [filterTopic, setFilterTopic] = useState<string>('')

  // Get unique languages and topics from documents
  const languages = useMemo(() => {
    const langs = Array.from(new Set(documents.map((d) => d.language_code)))
    return langs.filter(Boolean).sort()
  }, [documents])

  const topics = useMemo(() => {
    const t = Array.from(new Set(documents.map((d) => d.topic)))
    return t.filter(Boolean).sort()
  }, [documents])

  // Filter and sort documents
  const filteredDocuments = useMemo(() => {
    let result = [...documents]

    // Apply filters
    if (filterLanguage) {
      result = result.filter((d) => d.language_code === filterLanguage)
    }
    if (filterTopic) {
      result = result.filter((d) => d.topic === filterTopic)
    }

    // Apply sort
    switch (sortBy) {
      case 'year-asc':
        result.sort((a, b) => a.year - b.year)
        break
      case 'year-desc':
        result.sort((a, b) => b.year - a.year)
        break
      case 'title':
        result.sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'size':
        result.sort((a, b) => b.char_count - a.char_count)
        break
    }

    return result
  }, [documents, filterLanguage, filterTopic, sortBy])

  const hasActiveFilters = filterLanguage || filterTopic

  return (
    <div>
      {/* Toolbar */}
      {(showFilters || showSort) && (
        <div className="flex flex-wrap items-center gap-4 mb-6 pb-4 border-b border-paper-200">
          {/* Filters */}
          {showFilters && languages.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="meta-label">Language</label>
              <select
                value={filterLanguage}
                onChange={(e) => setFilterLanguage(e.target.value)}
                className="font-sans text-sm bg-paper-50 border border-paper-300 rounded-sm px-2 py-1
                           focus:outline-none focus:border-copper-400"
              >
                <option value="">All</option>
                {languages.map((lang) => (
                  <option key={lang} value={lang}>
                    {LANGUAGE_NAMES[lang] || lang}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showFilters && topics.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="meta-label">Topic</label>
              <select
                value={filterTopic}
                onChange={(e) => setFilterTopic(e.target.value)}
                className="font-sans text-sm bg-paper-50 border border-paper-300 rounded-sm px-2 py-1
                           focus:outline-none focus:border-copper-400"
              >
                <option value="">All</option>
                {topics.map((topic) => (
                  <option key={topic} value={topic}>
                    {TOPIC_NAMES[topic] || topic}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Sort */}
          {showSort && (
            <div className="flex items-center gap-2">
              <label className="meta-label">Sort</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="font-sans text-sm bg-paper-50 border border-paper-300 rounded-sm px-2 py-1
                           focus:outline-none focus:border-copper-400"
              >
                <option value="year-asc">Oldest first</option>
                <option value="year-desc">Newest first</option>
                <option value="title">Title A-Z</option>
                <option value="size">Longest first</option>
              </select>
            </div>
          )}

          {/* Results count */}
          <span className="font-mono text-sm text-ink-400">
            {filteredDocuments.length} {filteredDocuments.length === 1 ? 'document' : 'documents'}
          </span>
        </div>
      )}

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          onClick={() => {
            setFilterLanguage('')
            setFilterTopic('')
          }}
          className="mb-4 text-sm text-copper-700 hover:underline"
        >
          Clear filters ×
        </button>
      )}

      {/* Document list */}
      {filteredDocuments.length > 0 ? (
        <div className={variant === 'featured' ? 'grid md:grid-cols-2 gap-6' : 'space-y-2'}>
          {filteredDocuments.map((doc) => (
            <DocumentCard
              key={doc.identifier}
              document={doc}
              variant={variant}
              showTopic={showTopic && !filterTopic}
              showLanguage={showLanguage && !filterLanguage}
            />
          ))}
        </div>
      ) : (
        <p className="text-center text-ink-400 py-16">{emptyMessage}</p>
      )}
    </div>
  )
}
