'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface WikipediaResult {
  title: string
  extract: string
  thumbnail?: {
    source: string
    width: number
    height: number
  }
  content_urls?: {
    desktop: {
      page: string
    }
  }
}

interface AuthorInfoProps {
  creator: string | string[] | undefined
}

// Common Latin to vernacular name mappings
const LATIN_NAME_VARIANTS: Record<string, string> = {
  'Christophorus': 'Christoph',
  'Joannes': 'Johann',
  'Johannes': 'Johann',
  'Wolfgangus': 'Wolfgang',
  'Franciscus': 'Franz',
  'Georgius': 'Georg',
  'Henricus': 'Heinrich',
  'Fridericus': 'Friedrich',
  'Guilielmus': 'Wilhelm',
  'Carolus': 'Karl',
  'Ludovicus': 'Ludwig',
  'Antonius': 'Anton',
  'Benedictus': 'Benedikt',
}

function extractAuthorName(creator: string): string {
  // Remove dates like "1635-1703" or "(1635-1703)"
  let name = creator.replace(/,?\s*\(?\d{4}\s*-\s*\d{4}\)?/g, '').trim()
  // Remove titles like "praeses", "respondent", etc.
  name = name.replace(/,?\s*(praeses|respondent|editor|former owner|printer)$/i, '').trim()
  // Remove trailing commas
  name = name.replace(/,\s*$/, '').trim()
  return name
}

function normalizeLatinName(name: string): string {
  // Replace Latin name variants with vernacular forms
  let normalized = name
  for (const [latin, vernacular] of Object.entries(LATIN_NAME_VARIANTS)) {
    normalized = normalized.replace(new RegExp(latin, 'gi'), vernacular)
  }
  return normalized
}

export function AuthorInfo({ creator }: AuthorInfoProps) {
  const [wikiData, setWikiData] = useState<WikipediaResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get the primary author name
  const authorName = Array.isArray(creator) ? creator[0] : creator
  const cleanName = authorName ? extractAuthorName(authorName) : null

  useEffect(() => {
    async function fetchWikipedia() {
      if (!cleanName) return

      setLoading(true)
      setError(null)

      try {
        // Use Wikipedia REST API for summary
        const encodedName = encodeURIComponent(cleanName)
        const response = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedName}`,
          {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'GEMI-Archive/1.0 (https://github.com/benjaminbreen/corpus-builder)'
            }
          }
        )

        if (!response.ok) {
          if (response.status === 404) {
            // Try alternative name formats
            const parts = cleanName.split(',').map(p => p.trim())
            const namesToTry: string[] = []

            if (parts.length >= 2) {
              // e.g., "Sturm, Johann Christophorus" -> "Johann Christophorus Sturm"
              namesToTry.push(`${parts[1]} ${parts[0]}`)
              // Also try with Latin names normalized
              // e.g., "Johann Christophorus Sturm" -> "Johann Christoph Sturm"
              const normalizedAlt = normalizeLatinName(`${parts[1]} ${parts[0]}`)
              if (normalizedAlt !== `${parts[1]} ${parts[0]}`) {
                namesToTry.push(normalizedAlt)
              }
            }

            // Try each alternative name
            for (const altName of namesToTry) {
              const altResponse = await fetch(
                `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(altName)}`,
                {
                  headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'GEMI-Archive/1.0'
                  }
                }
              )
              if (altResponse.ok) {
                const data = await altResponse.json()
                if (data.type !== 'disambiguation') {
                  setWikiData(data)
                  return
                }
              }
            }
            setError('not-found')
            return
          }
          throw new Error(`Wikipedia API error: ${response.status}`)
        }

        const data = await response.json()

        // Skip disambiguation pages
        if (data.type === 'disambiguation') {
          setError('disambiguation')
          return
        }

        setWikiData(data)
      } catch (err) {
        console.error('Wikipedia fetch error:', err)
        setError('error')
      } finally {
        setLoading(false)
      }
    }

    fetchWikipedia()
  }, [cleanName])

  // Don't render if no author name
  if (!cleanName) {
    return null
  }

  // Show subtle loading state
  if (loading) {
    return (
      <div className="bg-paper-50 border border-paper-200 rounded-sm p-4 animate-pulse">
        <div className="flex gap-4">
          <div className="w-20 h-24 bg-paper-200 rounded-sm" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-paper-200 rounded w-3/4" />
            <div className="h-3 bg-paper-200 rounded w-full" />
            <div className="h-3 bg-paper-200 rounded w-5/6" />
          </div>
        </div>
      </div>
    )
  }

  // Don't show if no Wikipedia data found
  if (error || !wikiData) {
    return null
  }

  return (
    <div className="bg-paper-50 border border-paper-200 rounded-sm p-4">
      <div className="flex gap-4">
        {/* Portrait */}
        {wikiData.thumbnail && (
          <div className="flex-shrink-0">
            <Image
              src={wikiData.thumbnail.source}
              alt={wikiData.title}
              width={80}
              height={100}
              className="rounded-sm border border-paper-300 object-cover"
              style={{ width: 80, height: 'auto', maxHeight: 120 }}
              unoptimized // Wikipedia images don't need Next.js optimization
            />
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-medium text-sm text-ink-800">{wikiData.title}</h4>
            {wikiData.content_urls?.desktop?.page && (
              <a
                href={wikiData.content_urls.desktop.page}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-copper-600 hover:text-copper-700 whitespace-nowrap"
              >
                Wikipedia ↗
              </a>
            )}
          </div>
          <p className="text-xs text-ink-600 leading-relaxed line-clamp-4">
            {wikiData.extract}
          </p>
        </div>
      </div>
    </div>
  )
}
