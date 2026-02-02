import Link from 'next/link'
import { Document, LANGUAGE_NAMES, TOPIC_NAMES } from '@/lib/types'

interface DocumentCardProps {
  document: Document
  showTopic?: boolean
  showLanguage?: boolean
  showDecade?: boolean
  variant?: 'default' | 'compact' | 'featured'
}

export function DocumentCard({
  document: doc,
  showTopic = true,
  showLanguage = true,
  showDecade = false,
  variant = 'default',
}: DocumentCardProps) {
  const decade = Math.floor(doc.year / 10) * 10

  if (variant === 'compact') {
    return (
      <Link
        href={`/document/${doc.identifier}`}
        className="group flex items-baseline gap-3 py-2 hover:bg-paper-100 -mx-2 px-2 rounded-sm transition-colors"
      >
        <span className="date-stamp shrink-0">{doc.year}</span>
        <span className="font-serif text-sm text-ink-900 group-hover:text-copper-700 truncate transition-colors">
          {doc.title}
        </span>
      </Link>
    )
  }

  if (variant === 'featured') {
    return (
      <Link
        href={`/document/${doc.identifier}`}
        className="group block p-6 bg-paper-100 border border-paper-200 rounded-sm
                   hover:border-copper-400 hover:shadow-subtle transition-all"
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <span className="date-stamp">{doc.year}</span>
          <div className="flex gap-1.5">
            {showLanguage && (
              <span className="tag text-xs">
                {LANGUAGE_NAMES[doc.language_code] || doc.language_code}
              </span>
            )}
            {showTopic && (
              <span className="tag text-xs">
                {TOPIC_NAMES[doc.topic] || doc.topic}
              </span>
            )}
          </div>
        </div>

        <h3 className="font-serif text-lg text-ink-900 group-hover:text-copper-700 transition-colors mb-2 line-clamp-2">
          {doc.title}
        </h3>

        {doc.creator && (
          <p className="font-sans text-sm text-ink-500 mb-3">
            {doc.creator}
          </p>
        )}

        {doc.description && (
          <p className="font-serif text-sm text-ink-600 leading-relaxed line-clamp-3">
            {typeof doc.description === 'string'
              ? doc.description
              : Array.isArray(doc.description)
              ? doc.description[0]
              : ''}
          </p>
        )}

        <div className="mt-4 pt-3 border-t border-paper-200 flex items-center justify-between">
          <span className="font-mono text-xs text-ink-400">
            {Math.round(doc.char_count / 1000).toLocaleString()}k characters
          </span>
          <span className="font-sans text-sm text-copper-700 group-hover:underline">
            Read →
          </span>
        </div>
      </Link>
    )
  }

  // Default variant
  return (
    <Link
      href={`/document/${doc.identifier}`}
      className="doc-card block group"
    >
      <div className="flex items-start gap-4">
        <span className="date-stamp shrink-0 pt-0.5">{doc.year}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-base text-ink-900 group-hover:text-copper-700 transition-colors line-clamp-2">
            {doc.title}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            {doc.creator && (
              <span className="font-sans text-sm text-ink-500">
                {doc.creator}
              </span>
            )}
            {showLanguage && (
              <span className="tag">
                {LANGUAGE_NAMES[doc.language_code] || doc.language_code}
              </span>
            )}
            {showTopic && (
              <span className="tag">
                {TOPIC_NAMES[doc.topic] || doc.topic}
              </span>
            )}
            {showDecade && (
              <span className="tag">{decade}s</span>
            )}
          </div>
        </div>
        <span className="font-mono text-xs text-ink-400 shrink-0">
          {Math.round(doc.char_count / 1000)}k
        </span>
      </div>
    </Link>
  )
}
