'use client'

import Link from 'next/link'

export default function SearchPage() {
  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-12">
        <Link href="/" className="nav-link inline-flex items-center gap-1 mb-8">
          ← Back to Home
        </Link>

        <h1 className="mb-4">Search the Archive</h1>
        <p className="text-lg text-ink-600 max-w-2xl mb-8">
          Full-text search across {new Date().getFullYear() - 1600} years of texts on
          cognition, automation, and the thinking machine.
        </p>

        {/* Search input */}
        <div className="max-w-2xl">
          <div className="relative">
            <input
              type="text"
              placeholder='Search for phrases like "thinking machine" or "mechanical brain"...'
              className="input text-lg pr-12"
              autoFocus
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-mono bg-paper-200 text-ink-400 rounded">
              ⏎
            </kbd>
          </div>
          <p className="mt-3 text-sm text-ink-400">
            Pagefind search will be enabled after running <code className="font-mono bg-paper-200 px-1 rounded">npm run build:full</code>
          </p>
        </div>
      </section>

      <div className="rule" />

      {/* Placeholder for search results */}
      <section className="container-content py-12">
        <div className="text-center py-16 text-ink-400">
          <p className="text-lg mb-2">Enter a search term above</p>
          <p className="text-sm">
            Search supports exact phrases in quotes, e.g. "thinking machines"
          </p>
        </div>
      </section>
    </div>
  )
}
