import type { ReactNode } from 'react'

export type TextHit = {
  index: number
  start: number
  end: number
  term: string
}

const WORD_CHAR = /[a-z0-9]/i

function isWordBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return true
  return !WORD_CHAR.test(text[index])
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ')
}

export function extractHighlightTerms(query: string): string[] {
  const normalized = normalizeQuery(query)
  if (!normalized) return []

  const candidates = [normalized]
  const tokenized = normalized
    .split(/[^a-z0-9']+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)

  candidates.push(...tokenized)

  const seen = new Set<string>()
  const unique: string[] = []
  for (const candidate of candidates) {
    const key = candidate.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(candidate)
  }

  return unique.sort((a, b) => b.length - a.length)
}

type HitCandidate = {
  start: number
  end: number
  term: string
}

type FindHitsOptions = {
  maxHits?: number
}

export function findTextHits(text: string, terms: string[], options: FindHitsOptions = {}): TextHit[] {
  const maxHits = Math.max(options.maxHits ?? 250, 0)
  if (!text || terms.length === 0 || maxHits === 0) return []

  const textLower = text.toLowerCase()
  const candidates: HitCandidate[] = []

  for (const term of terms) {
    const normalizedTerm = term.trim().toLowerCase()
    if (normalizedTerm.length < 2) continue

    const requiresBoundary = /^[a-z0-9']+$/i.test(normalizedTerm)
    let from = 0

    while (from < textLower.length) {
      const found = textLower.indexOf(normalizedTerm, from)
      if (found === -1) break

      const end = found + normalizedTerm.length
      if (
        !requiresBoundary ||
        (isWordBoundary(textLower, found - 1) && isWordBoundary(textLower, end))
      ) {
        candidates.push({
          start: found,
          end,
          term: term,
        })
      }

      from = found + Math.max(1, normalizedTerm.length)
      if (candidates.length >= maxHits * 6) break
    }
  }

  candidates.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    return b.end - a.end
  })

  const selected: TextHit[] = []
  for (const candidate of candidates) {
    const previous = selected[selected.length - 1]
    if (previous && candidate.start < previous.end) continue
    selected.push({
      index: selected.length,
      start: candidate.start,
      end: candidate.end,
      term: candidate.term,
    })
    if (selected.length >= maxHits) break
  }

  return selected
}

export function buildHitPreview(text: string, hit: Pick<TextHit, 'start' | 'end'>, radius = 52): string {
  const left = Math.max(0, hit.start - radius)
  const right = Math.min(text.length, hit.end + radius)
  const prefix = left > 0 ? '…' : ''
  const suffix = right < text.length ? '…' : ''
  return `${prefix}${text.slice(left, right).replace(/\s+/g, ' ').trim()}${suffix}`
}

type RenderOptions = {
  activeHitIndex?: number | null
  idPrefix?: string
  className?: string
  activeClassName?: string
}

export function renderTextWithHighlights(
  text: string,
  hits: TextHit[],
  options: RenderOptions = {},
): ReactNode {
  if (!text || hits.length === 0) return text

  const {
    activeHitIndex = null,
    idPrefix = 'search-hit',
    className = 'search-highlight',
    activeClassName = 'ring-1 ring-copper-500 ring-offset-1',
  } = options

  const nodes: ReactNode[] = []
  let cursor = 0

  for (const hit of hits) {
    if (hit.start > cursor) {
      nodes.push(text.slice(cursor, hit.start))
    }

    const hitText = text.slice(hit.start, hit.end)
    const isActive = activeHitIndex === hit.index
    nodes.push(
      <mark
        key={`${idPrefix}-${hit.index}-${hit.start}`}
        id={`${idPrefix}-${hit.index}`}
        className={`${className}${isActive ? ` ${activeClassName}` : ''}`}
        data-hit-index={hit.index}
      >
        {hitText}
      </mark>,
    )
    cursor = hit.end
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes
}
