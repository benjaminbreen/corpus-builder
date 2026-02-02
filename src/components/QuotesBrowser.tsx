'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import type { Quote } from '@/lib/types'
import { LANGUAGE_NAMES, TOPIC_NAMES } from '@/lib/types'

type SortMode = 'oldest' | 'newest' | 'language'

interface QuotesBrowserProps {
  quotes: Quote[]
  title?: string
  subtitle?: string
}

function renderQuoteHtml(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

export function QuotesBrowser({ quotes, title, subtitle }: QuotesBrowserProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('oldest')

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    quotes.forEach((q) => q.tags.forEach((t) => tags.add(t)))
    return Array.from(tags).sort()
  }, [quotes])

  const filteredQuotes = useMemo(() => {
    let result = quotes
    if (selectedTags.length > 0) {
      result = result.filter((q) => q.tags.some((t) => selectedTags.includes(t)))
    }

    if (sortMode === 'oldest') {
      result = [...result].sort((a, b) => a.year - b.year)
    } else if (sortMode === 'newest') {
      result = [...result].sort((a, b) => b.year - a.year)
    } else {
      result = [...result].sort((a, b) =>
        a.language_code.localeCompare(b.language_code) || a.year - b.year
      )
    }

    return result
  }, [quotes, selectedTags, sortMode])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  return (
    <section className="container-content py-12 md:py-16">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          {title && <h1 className="mb-2">{title}</h1>}
          {subtitle && <p className="text-ink-500 max-w-2xl">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2">
          <span className="meta-label">Sort</span>
          {(['oldest', 'newest', 'language'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-3 py-1 text-xs rounded-sm border transition-colors ${
                sortMode === mode
                  ? 'bg-copper-600 text-paper-50 border-copper-600'
                  : 'bg-paper-50 text-ink-600 border-paper-300 hover:border-copper-400'
              }`}
            >
              {mode === 'oldest' ? 'Oldest' : mode === 'newest' ? 'Newest' : 'Language'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-8">
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              selectedTags.includes(tag)
                ? 'bg-ink-900 text-paper-50 border-ink-900'
                : 'bg-paper-50 text-ink-600 border-paper-300 hover:border-copper-400'
            }`}
          >
            {tag}
          </button>
        ))}
        {selectedTags.length > 0 && (
          <button
            onClick={() => setSelectedTags([])}
            className="px-3 py-1 text-xs rounded-full border border-paper-300 text-ink-500 hover:border-copper-400"
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid gap-6">
        {filteredQuotes.map((quote) => (
          <article key={quote.id} className="bg-paper-50 border border-paper-200 rounded-sm p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-ink-500 text-xs mb-3">
              <span className="font-mono">{quote.year}</span>
              <span className="text-ink-300">·</span>
              <span>{LANGUAGE_NAMES[quote.language_code] || quote.language_code}</span>
              <span className="text-ink-300">·</span>
              <span>{TOPIC_NAMES[quote.topic] || quote.topic}</span>
              {quote.page && (
                <>
                  <span className="text-ink-300">·</span>
                  <span>p. {quote.page}</span>
                </>
              )}
            </div>

            <blockquote
              className="font-serif text-lg text-ink-800 leading-relaxed mb-4"
              dangerouslySetInnerHTML={{
                __html: `&ldquo;${renderQuoteHtml(quote.text)}&rdquo;`,
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              {quote.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
              <span className="ml-auto text-sm">
                <Link href={`/document/${quote.doc_id}`} className="nav-link">
                  {quote.source_title || 'View document'} →
                </Link>
              </span>
            </div>
          </article>
        ))}
        {filteredQuotes.length === 0 && (
          <div className="text-ink-500 text-sm">No quotes match the selected tags.</div>
        )}
      </div>
    </section>
  )
}
