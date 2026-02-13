'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  buildHitPreview,
  extractHighlightTerms,
  findTextHits,
  renderTextWithHighlights,
  type TextHit,
} from '@/lib/highlight'
import { normalizeOcrText } from '@/lib/text-clean'

interface TextViewerProps {
  filename: string | null
  supabaseUrl: string
  docTitle?: string
  docCreator?: string
  docYear?: number
  docSourceUrl?: string
  docIdentifier?: string
  bucketName?: string
  hasTranslation?: boolean
  translationFilename?: string
  originalLanguage?: string
  originalLanguageCode?: string
  gibberishPages?: number[]
}

type ParagraphSegment = {
  id: string
  start: number
  end: number
  text: string
}

type InlineParagraphTranslation = {
  translatedText: string
  mode: 'full' | 'partial'
  sourceText: string
}

type CitationStyle = 'chicago' | 'apa' | 'mla' | 'harvard'
type InlineTranslationCacheStore = Record<string, { translatedSource: string; updatedAt: number }>

const CITATION_STYLE_STORAGE_KEY = 'gemi:citation-style'
const MAX_INLINE_TRANSLATE_CHARS = 45_000
const PAGE_HEADER_LOOKBEHIND_CHARS = 2400
const INLINE_TRANSLATION_CACHE_STORAGE_KEY = 'gemi:inline-translation-cache-v1'
const INLINE_TRANSLATION_CACHE_MAX_ENTRIES = 100
const INLINE_TRANSLATION_CACHE_MAX_TEXT_CHARS = 30_000

const CITATION_STYLE_OPTIONS: Array<{ id: CitationStyle; label: string }> = [
  { id: 'chicago', label: 'Chicago' },
  { id: 'apa', label: 'APA' },
  { id: 'mla', label: 'MLA' },
  { id: 'harvard', label: 'Harvard' },
]

function splitParagraphs(text: string): ParagraphSegment[] {
  if (!text) return []

  const paragraphs: ParagraphSegment[] = []
  const dividerRegex = /\n{2,}/g
  let cursor = 0
  let match: RegExpExecArray | null = dividerRegex.exec(text)

  while (match) {
    const chunk = text.slice(cursor, match.index)
    if (chunk.trim().length > 0) {
      paragraphs.push({
        id: `p-${paragraphs.length}`,
        start: cursor,
        end: match.index,
        text: chunk,
      })
    }

    cursor = match.index + match[0].length
    match = dividerRegex.exec(text)
  }

  if (cursor < text.length) {
    const chunk = text.slice(cursor)
    if (chunk.trim().length > 0) {
      paragraphs.push({
        id: `p-${paragraphs.length}`,
        start: cursor,
        end: text.length,
        text: chunk,
      })
    }
  }

  if (paragraphs.length === 0) {
    return [{ id: 'p-0', start: 0, end: text.length, text }]
  }

  return paragraphs
}

function isLikelyEnglish(originalLanguage?: string, originalLanguageCode?: string): boolean {
  const code = String(originalLanguageCode || '').trim().toLowerCase()
  if (code) return code === 'en' || code === 'eng'

  const label = String(originalLanguage || '').trim().toLowerCase()
  if (!label) return true
  return label === 'english' || label === 'en' || label === 'eng'
}

function cleanInlineText(value: string | undefined | null): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function cleanCreator(creator: string | undefined): string {
  if (!creator) return ''
  return creator
    .replace(/\(\s*\d{3,4}\s*-\s*\d{1,4}\s*\)/g, '')
    .replace(/,\s*\d{3,4}\s*-\s*\d{1,4}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function ensureTrailingPeriod(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (/[.!?]$/.test(trimmed)) return trimmed
  return `${trimmed}.`
}

function detectPageFromMarkers(content: string, offset: number): number | null {
  if (!content) return null
  const markerRegex = /--- Page (\d+) ---/g
  let match: RegExpExecArray | null = markerRegex.exec(content)
  let candidate: number | null = null

  while (match) {
    if (match.index > offset) break
    const parsed = Number(match[1])
    if (Number.isFinite(parsed)) candidate = parsed
    match = markerRegex.exec(content)
  }

  return candidate
}

function detectPageFromHeaders(content: string, offset: number): number | null {
  if (!content) return null
  const windowStart = Math.max(0, offset - PAGE_HEADER_LOOKBEHIND_CHARS)
  const scope = content.slice(windowStart, offset + 300)
  const lines = scope.split('\n')
  let cursor = windowStart
  let candidate: { pos: number; page: number } | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    const linePos = cursor
    cursor += line.length + 1
    if (!trimmed) continue

    let page: number | null = null
    const explicitPage = trimmed.match(/^(?:p(?:age)?\.?\s*)(\d{1,4})$/i)
    if (explicitPage) {
      page = Number(explicitPage[1])
    } else {
      const capsEnd = trimmed.match(/^[A-ZÀ-ÖØ-Þ0-9\s.'-]{6,}\s+(\d{1,4})$/)
      const capsStart = trimmed.match(/^(\d{1,4})\s+[A-ZÀ-ÖØ-Þ0-9\s.'-]{6,}$/)
      const simpleOnly = trimmed.match(/^(\d{1,4})$/)
      if (capsEnd) page = Number(capsEnd[1])
      else if (capsStart) page = Number(capsStart[1])
      else if (simpleOnly) page = Number(simpleOnly[1])
    }

    if (page && page >= 1 && page <= 2500 && linePos <= offset) {
      if (!candidate || linePos >= candidate.pos) {
        candidate = { pos: linePos, page }
      }
    }
  }

  return candidate?.page ?? null
}

function detectPageNumber(content: string, offset: number): number | null {
  return detectPageFromMarkers(content, offset) ?? detectPageFromHeaders(content, offset)
}

function buildCitationText(params: {
  style: CitationStyle
  title: string
  author: string
  year: number | null
  page: number | null
  sourceUrl: string
  identifier: string
}): string {
  const { style, title, author, year, page, sourceUrl, identifier } = params
  const safeTitle = cleanInlineText(title) || identifier || 'Untitled document'
  const safeAuthor = cleanInlineText(author)
  const safeUrl = cleanInlineText(sourceUrl)
  const yearText = year ? String(year) : 'n.d.'
  const pageText = page ? `p. ${page}` : ''

  if (style === 'apa') {
    const head = safeAuthor ? `${safeAuthor}. (${yearText}). ${safeTitle}.` : `${safeTitle}. (${yearText}).`
    return ensureTrailingPeriod([head, pageText, safeUrl].filter(Boolean).join(' ').trim())
  }

  if (style === 'mla') {
    const head = safeAuthor ? `${safeAuthor}. ${safeTitle}. ${yearText}.` : `${safeTitle}. ${yearText}.`
    return ensureTrailingPeriod([head, pageText, safeUrl].filter(Boolean).join(' ').trim())
  }

  if (style === 'harvard') {
    const accessed = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const head = safeAuthor ? `${safeAuthor} (${yearText}) ${safeTitle}` : `${safeTitle} (${yearText})`
    const middle = pageText ? `${head}, ${pageText}` : head
    const tail = safeUrl ? `Available at: ${safeUrl} (Accessed: ${accessed}).` : ''
    return ensureTrailingPeriod(`${middle}. ${tail}`.trim())
  }

  const chicagoHead = safeAuthor ? `${safeAuthor}, ${safeTitle}` : safeTitle
  const chicagoTail = [`(${yearText})`, pageText, safeUrl].filter(Boolean).join(', ')
  return ensureTrailingPeriod(`${chicagoHead} ${chicagoTail}`.trim())
}

function hashString(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return (hash >>> 0).toString(36)
}

function buildInlineTranslationCacheKey(docKey: string, paragraphId: string, sourceText: string): string {
  return `${docKey}::${paragraphId}::${hashString(sourceText)}`
}

function readInlineTranslationCache(): InlineTranslationCacheStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.sessionStorage.getItem(INLINE_TRANSLATION_CACHE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as InlineTranslationCacheStore
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function writeInlineTranslationCache(store: InlineTranslationCacheStore): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(INLINE_TRANSLATION_CACHE_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Ignore storage failures (quota/private browsing restrictions).
  }
}

function getCachedInlineTranslation(cacheKey: string): string | null {
  const store = readInlineTranslationCache()
  const entry = store[cacheKey]
  if (!entry?.translatedSource) return null

  store[cacheKey] = { ...entry, updatedAt: Date.now() }
  writeInlineTranslationCache(store)
  return entry.translatedSource
}

function setCachedInlineTranslation(cacheKey: string, translatedSource: string): void {
  const normalized = translatedSource.trim()
  if (!normalized || normalized.length > INLINE_TRANSLATION_CACHE_MAX_TEXT_CHARS) return

  const store = readInlineTranslationCache()
  store[cacheKey] = { translatedSource: normalized, updatedAt: Date.now() }

  const entries = Object.entries(store)
  if (entries.length > INLINE_TRANSLATION_CACHE_MAX_ENTRIES) {
    entries.sort((a, b) => a[1].updatedAt - b[1].updatedAt)
    const overflow = entries.length - INLINE_TRANSLATION_CACHE_MAX_ENTRIES
    for (let i = 0; i < overflow; i += 1) {
      delete store[entries[i][0]]
    }
  }

  writeInlineTranslationCache(store)
}

export function TextViewer({
  filename,
  supabaseUrl,
  docTitle,
  docCreator,
  docYear,
  docSourceUrl,
  docIdentifier,
  bucketName = 'corpus-texts',
  hasTranslation = false,
  translationFilename,
  originalLanguage,
  originalLanguageCode,
  gibberishPages,
}: TextViewerProps) {
  const searchParams = useSearchParams()
  const searchQuery = (searchParams.get('q') || '').trim()
  const startCharParam = useMemo(() => {
    const value = Number(searchParams.get('start'))
    return Number.isFinite(value) ? value : null
  }, [searchParams])

  const [text, setText] = useState<string | null>(null)
  const [translatedText, setTranslatedText] = useState<string | null>(null)
  const [translatorNote, setTranslatorNote] = useState<string | null>(null)
  const [showTranslatorNote, setShowTranslatorNote] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingTranslation, setLoadingTranslation] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base')
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('chicago')
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [showTranslation, setShowTranslation] = useState(() => hasTranslation && !searchQuery)
  const [activeHitIndex, setActiveHitIndex] = useState(0)

  const [inlineTranslations, setInlineTranslations] = useState<Record<string, InlineParagraphTranslation>>({})
  const [translatingParagraphId, setTranslatingParagraphId] = useState<string | null>(null)
  const [hoveredParagraphId, setHoveredParagraphId] = useState<string | null>(null)
  const [selectedParagraphId, setSelectedParagraphId] = useState<string | null>(null)
  const [selectionByParagraph, setSelectionByParagraph] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const didInitialHitJump = useRef(false)
  const settingsRef = useRef<HTMLDivElement | null>(null)

  // Fetch original text
  useEffect(() => {
    async function fetchText() {
      if (!filename) {
        setError('No text file available')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      setText(null)
      setTranslatedText(null)
      setTranslatorNote(null)

      try {
        let response: Response | null = null

        // Prefer local raw text in dev/exported builds
        response = await fetch(`/raw_texts/${filename}`)

        if (!response.ok && supabaseUrl) {
          const url = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filename}`
          response = await fetch(url)
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch text: ${response.status}`)
        }

        const content = await response.text()
        setText(normalizeOcrText(content))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load text')
      } finally {
        setLoading(false)
      }
    }

    fetchText()
  }, [filename, supabaseUrl, bucketName])

  useEffect(() => {
    if (searchQuery && showTranslation) {
      setShowTranslation(false)
    }
  }, [searchQuery, showTranslation])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CITATION_STYLE_STORAGE_KEY)
      if (saved && CITATION_STYLE_OPTIONS.some((option) => option.id === saved)) {
        setCitationStyle(saved as CitationStyle)
      }
    } catch {
      // Ignore localStorage errors in restricted environments.
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(CITATION_STYLE_STORAGE_KEY, citationStyle)
    } catch {
      // Ignore localStorage errors in restricted environments.
    }
  }, [citationStyle])

  useEffect(() => {
    if (!actionError) return
    const timeout = window.setTimeout(() => setActionError(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [actionError])

  useEffect(() => {
    if (!actionNotice) return
    const timeout = window.setTimeout(() => setActionNotice(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [actionNotice])

  useEffect(() => {
    if (!showSettingsMenu) return

    const handlePointerDown = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSettingsMenu(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showSettingsMenu])

  // Fetch translation when toggled
  useEffect(() => {
    async function fetchTranslation() {
      if (!showTranslation || !translationFilename || translatedText) return

      setLoadingTranslation(true)
      try {
        // Try local file first (for development)
        let response = await fetch(`/translations/${translationFilename}`)

        // If local fails, try Supabase
        if (!response.ok) {
          const url = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${translationFilename}`
          response = await fetch(url)
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch translation: ${response.status}`)
        }

        const content = await response.text()
        const { cleanedText, note } = extractTranslatorNote(content)
        setTranslatedText(cleanedText)
        setTranslatorNote(note)
        setShowTranslatorNote(true)
      } catch (err) {
        console.error('Failed to load translation:', err)
        // Fall back to showing original
        setShowTranslation(false)
      } finally {
        setLoadingTranslation(false)
      }
    }

    fetchTranslation()
  }, [showTranslation, translationFilename, translatedText, supabaseUrl, bucketName])

  useEffect(() => {
    // Reset inline state when document or full-doc language mode changes.
    setInlineTranslations({})
    setTranslatingParagraphId(null)
    setHoveredParagraphId(null)
    setSelectedParagraphId(null)
    setSelectionByParagraph({})
  }, [filename, showTranslation])

  function extractTranslatorNote(content: string): { cleanedText: string; note: string | null } {
    const match = content.match(
      /Translator[’']s note:\s*([\s\S]*?)(?=\n\n\*This is|\n\*This is|\n\n---|\n---|$)/,
    )
    if (!match) {
      return { cleanedText: content, note: null }
    }
    const note = match[1].trim()
    const cleanedText = content.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim()
    return { cleanedText, note }
  }

  const fontSizeClasses = {
    sm: 'text-xs leading-relaxed',
    base: 'text-sm leading-relaxed',
    lg: 'text-base leading-loose',
  }

  function filterGibberishPages(content: string, pages: number[] | undefined): string {
    if (!content || !pages || pages.length === 0) return content
    const parts = content.split(/\n--- Page (\d+) ---\n/)
    if (parts.length < 3) return content
    let result = parts[0]
    for (let i = 1; i < parts.length; i += 2) {
      const pageNum = Number(parts[i])
      const pageText = parts[i + 1] ?? ''
      if (!pages.includes(pageNum)) {
        result += `\n--- Page ${pageNum} ---\n${pageText}`
      }
    }
    return result.trim()
  }

  const displayText = showTranslation && translatedText ? translatedText : text ? filterGibberishPages(text, gibberishPages) : text
  const inlineTranslationDocKey =
    cleanInlineText(docIdentifier) || cleanInlineText(filename) || `${cleanInlineText(docSourceUrl)}|${cleanInlineText(docTitle)}`
  const resolvedCitationTitle = cleanInlineText(docTitle) || cleanInlineText(filename) || cleanInlineText(docIdentifier)
  const resolvedCitationAuthor = cleanCreator(docCreator)
  const resolvedCitationYear = Number.isFinite(docYear) ? Number(docYear) : null
  const resolvedCitationUrl = cleanInlineText(docSourceUrl)
  const citationStyleLabel = CITATION_STYLE_OPTIONS.find((option) => option.id === citationStyle)?.label || 'Chicago'

  const highlightTerms = useMemo(() => extractHighlightTerms(searchQuery), [searchQuery])
  const textHits = useMemo(
    () => (displayText ? findTextHits(displayText, highlightTerms, { maxHits: 280 }) : []),
    [displayText, highlightTerms],
  )

  const paragraphs = useMemo(() => splitParagraphs(displayText || ''), [displayText])
  const paragraphMap = useMemo(() => new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph])), [paragraphs])

  const { hitsByParagraph, hitParagraphByIndex } = useMemo(() => {
    const hitParagraphLookup = new Map<number, string>()
    const scopedHitMap = new Map<string, TextHit[]>()

    for (const paragraph of paragraphs) {
      const scopedHits: TextHit[] = []
      for (const hit of textHits) {
        if (hit.start >= paragraph.start && hit.end <= paragraph.end) {
          scopedHits.push({
            ...hit,
            start: hit.start - paragraph.start,
            end: hit.end - paragraph.start,
          })
          hitParagraphLookup.set(hit.index, paragraph.id)
        }
      }
      scopedHitMap.set(paragraph.id, scopedHits)
    }

    return {
      hitsByParagraph: scopedHitMap,
      hitParagraphByIndex: hitParagraphLookup,
    }
  }, [paragraphs, textHits])

  const canNavigateHits = textHits.length > 0
  const canInlineTranslate = useMemo(
    () => Boolean(displayText) && !showTranslation && !isLikelyEnglish(originalLanguage, originalLanguageCode),
    [displayText, originalLanguage, originalLanguageCode, showTranslation],
  )
  const activeToolbarParagraphId = selectedParagraphId || hoveredParagraphId

  useEffect(() => {
    didInitialHitJump.current = false
    if (textHits.length === 0) {
      setActiveHitIndex(0)
      return
    }

    if (startCharParam === null) {
      setActiveHitIndex(0)
      return
    }

    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i < textHits.length; i += 1) {
      const distance = Math.abs(textHits[i].start - startCharParam)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }
    setActiveHitIndex(bestIndex)
  }, [startCharParam, textHits, filename, showTranslation])

  useEffect(() => {
    if (textHits.length === 0) return
    const clampedIndex = Math.max(0, Math.min(activeHitIndex, textHits.length - 1))
    const hitNode = document.getElementById(`text-hit-${clampedIndex}`)
    if (hitNode) {
      hitNode.scrollIntoView({
        block: 'center',
        behavior: didInitialHitJump.current ? 'smooth' : 'auto',
      })
      didInitialHitJump.current = true
      return
    }

    const paragraphId = hitParagraphByIndex.get(clampedIndex)
    const paragraphNode = paragraphId ? document.getElementById(`paragraph-${paragraphId}`) : null
    if (paragraphNode) {
      paragraphNode.scrollIntoView({
        block: 'center',
        behavior: didInitialHitJump.current ? 'smooth' : 'auto',
      })
      didInitialHitJump.current = true
    }
  }, [activeHitIndex, hitParagraphByIndex, textHits])

  const goToPreviousHit = useCallback(() => {
    if (!canNavigateHits) return
    setActiveHitIndex((prev) => (prev <= 0 ? textHits.length - 1 : prev - 1))
  }, [canNavigateHits, textHits.length])

  const goToNextHit = useCallback(() => {
    if (!canNavigateHits) return
    setActiveHitIndex((prev) => (prev >= textHits.length - 1 ? 0 : prev + 1))
  }, [canNavigateHits, textHits.length])

  const clearSelectionContext = useCallback(() => {
    setSelectedParagraphId(null)
  }, [])

  const captureSelectionContext = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      clearSelectionContext()
      return
    }

    const selectedText = selection.toString().trim()
    if (!selectedText) {
      clearSelectionContext()
      return
    }

    const range = selection.getRangeAt(0)
    const startNode = range.startContainer
    const endNode = range.endContainer

    const startElement = startNode.nodeType === Node.ELEMENT_NODE ? (startNode as Element) : startNode.parentElement
    const endElement = endNode.nodeType === Node.ELEMENT_NODE ? (endNode as Element) : endNode.parentElement

    const startParagraph = startElement?.closest<HTMLElement>('[data-paragraph-id]')
    const endParagraph = endElement?.closest<HTMLElement>('[data-paragraph-id]')

    if (!startParagraph || !endParagraph) {
      clearSelectionContext()
      return
    }

    const paragraphId = startParagraph.dataset.paragraphId
    if (!paragraphId || startParagraph !== endParagraph) {
      clearSelectionContext()
      return
    }

    setSelectedParagraphId(paragraphId)
    setSelectionByParagraph((prev) => ({ ...prev, [paragraphId]: selectedText }))
  }, [clearSelectionContext])

  const copyParagraph = useCallback(async (paragraphId: string) => {
    const paragraph = paragraphMap.get(paragraphId)
    if (!paragraph) return

    const visibleText = inlineTranslations[paragraphId]?.translatedText || paragraph.text
    const selectedText = selectionByParagraph[paragraphId]
    const toCopy = (selectedText || visibleText).trim()
    if (!toCopy) return

    try {
      await navigator.clipboard.writeText(toCopy)
      setActionError(null)
      setActionNotice('Text copied')
    } catch {
      setActionError('Copy failed. Clipboard access may be blocked in this browser.')
    }
  }, [inlineTranslations, paragraphMap, selectionByParagraph])

  const citeParagraph = useCallback(async (paragraphId: string) => {
    const paragraph = paragraphMap.get(paragraphId)
    if (!paragraph) return

    const page = displayText ? detectPageNumber(displayText, paragraph.start) : null
    const citation = buildCitationText({
      style: citationStyle,
      title: resolvedCitationTitle,
      author: resolvedCitationAuthor,
      year: resolvedCitationYear,
      page,
      sourceUrl: resolvedCitationUrl,
      identifier: cleanInlineText(docIdentifier),
    })

    if (!citation.trim()) {
      setActionError('Unable to build citation for this document.')
      return
    }

    try {
      await navigator.clipboard.writeText(citation)
      setActionError(null)
      setActionNotice(page ? `Citation copied (${citationStyleLabel}; p. ${page})` : `Citation copied (${citationStyleLabel})`)
    } catch {
      setActionError('Citation copy failed. Clipboard access may be blocked in this browser.')
    }
  }, [
    citationStyle,
    citationStyleLabel,
    displayText,
    docIdentifier,
    paragraphMap,
    resolvedCitationAuthor,
    resolvedCitationTitle,
    resolvedCitationUrl,
    resolvedCitationYear,
  ])

  const toggleInlineTranslation = useCallback(async (paragraphId: string, preferSelection: boolean) => {
    if (!canInlineTranslate) return

    if (inlineTranslations[paragraphId]) {
      setInlineTranslations((prev) => {
        const next = { ...prev }
        delete next[paragraphId]
        return next
      })
      return
    }

    const paragraph = paragraphMap.get(paragraphId)
    if (!paragraph) return

    if (translatingParagraphId === paragraphId) return

    const selectedText = preferSelection ? (selectionByParagraph[paragraphId] || '').trim() : ''
    const sourceText = selectedText.length >= 2 ? selectedText : paragraph.text

    if (!sourceText.trim()) return
    if (sourceText.length > MAX_INLINE_TRANSLATE_CHARS) {
      setActionError(`Selection is too long to translate in-place (max ${MAX_INLINE_TRANSLATE_CHARS.toLocaleString()} chars).`)
      return
    }

    const applyTranslationToParagraph = (translatedSource: string) => {
      let translatedParagraph = translatedSource
      let mode: 'full' | 'partial' = 'full'

      if (selectedText && selectedText.length < paragraph.text.length && paragraph.text.includes(selectedText)) {
        translatedParagraph = paragraph.text.replace(selectedText, translatedSource)
        mode = 'partial'
      }

      setInlineTranslations((prev) => ({
        ...prev,
        [paragraphId]: {
          translatedText: translatedParagraph,
          mode,
          sourceText,
        },
      }))
    }

    const cacheKey = buildInlineTranslationCacheKey(inlineTranslationDocKey, paragraphId, sourceText)
    const cachedTranslation = getCachedInlineTranslation(cacheKey)
    if (cachedTranslation) {
      setActionError(null)
      applyTranslationToParagraph(cachedTranslation)
      return
    }

    setTranslatingParagraphId(paragraphId)
    setActionError(null)

    try {
      const response = await fetch('/api/translate-snippet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
          sourceLanguage: originalLanguageCode || originalLanguage || 'unknown',
          targetLanguage: 'English',
        }),
      })

      const payload = (await response.json()) as { translation?: string; error?: string }
      if (!response.ok || !payload.translation) {
        throw new Error(payload.error || `Translate failed (${response.status})`)
      }

      const translatedSource = payload.translation.trim()
      if (!translatedSource) {
        throw new Error('Empty translation returned')
      }

      setCachedInlineTranslation(cacheKey, translatedSource)
      applyTranslationToParagraph(translatedSource)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Translation failed')
    } finally {
      setTranslatingParagraphId(null)
    }
  }, [canInlineTranslate, inlineTranslations, inlineTranslationDocKey, originalLanguage, originalLanguageCode, paragraphMap, selectionByParagraph, translatingParagraphId])

  const handleParagraphClick = useCallback((paragraphId: string) => {
    if (!canInlineTranslate) return

    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) {
      return
    }

    void toggleInlineTranslation(paragraphId, false)
  }, [canInlineTranslate, toggleInlineTranslation])

  if (loading) {
    return (
      <div className="bg-paper-50 border border-paper-200 rounded-sm p-6 md:p-8">
        <div className="text-center py-16">
          <div className="inline-block w-6 h-6 border-2 border-copper-400 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-ink-400">Loading document text...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-paper-50 border border-paper-200 rounded-sm p-6 md:p-8">
        <div className="text-center py-16 text-ink-400">
          <p className="text-lg mb-2">Unable to load text</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-paper-50 border border-paper-200 rounded-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-paper-200 bg-paper-100">
        <div className="flex items-center gap-3">
          {/* Full-document translation toggle */}
          {hasTranslation && (
            <button
              onClick={() => setShowTranslation(!showTranslation)}
              disabled={loadingTranslation}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-sm border transition-colors ${
                showTranslation
                  ? 'bg-copper-600 text-paper-50 border-copper-600'
                  : 'bg-paper-50 text-ink-600 border-paper-300 hover:border-copper-400'
              }`}
            >
              {loadingTranslation ? (
                <>
                  <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  Loading...
                </>
              ) : showTranslation ? (
                <>
                  <span>EN</span>
                  <span className="text-copper-200">|</span>
                  <span className="opacity-60">{originalLanguage?.toUpperCase() || originalLanguageCode?.toUpperCase() || 'ORIG'}</span>
                </>
              ) : (
                <>
                  <span className="opacity-60">EN</span>
                  <span className="text-ink-300">|</span>
                  <span>{originalLanguage?.toUpperCase() || originalLanguageCode?.toUpperCase() || 'ORIG'}</span>
                </>
              )}
            </button>
          )}

          <span className="font-mono text-xs text-ink-400">
            {displayText ? `${displayText.length.toLocaleString()} characters` : ''}
            {showTranslation && ' (translation)'}
          </span>

          {searchQuery && (
            <span className="tag text-xs max-w-[280px] truncate" title={searchQuery}>
              Query: {searchQuery}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {searchQuery && (
            <div className="flex items-center gap-1.5 mr-2">
              <button
                type="button"
                onClick={goToPreviousHit}
                disabled={!canNavigateHits}
                className="px-2 py-0.5 text-xs rounded-sm border border-paper-300 bg-paper-50 text-ink-600 hover:border-copper-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={goToNextHit}
                disabled={!canNavigateHits}
                className="px-2 py-0.5 text-xs rounded-sm border border-paper-300 bg-paper-50 text-ink-600 hover:border-copper-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
              <span className="font-mono text-xs text-ink-500">
                {canNavigateHits ? `${activeHitIndex + 1}/${textHits.length}` : '0 hits'}
              </span>
            </div>
          )}

          <span className="font-sans text-xs text-ink-500 mr-1">Size:</span>
          {(['sm', 'base', 'lg'] as const).map((size) => (
            <button
              key={size}
              onClick={() => setFontSize(size)}
              className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                fontSize === size ? 'bg-copper-600 text-paper-50' : 'bg-paper-200 text-ink-600 hover:bg-paper-300'
              }`}
            >
              {size === 'sm' ? 'S' : size === 'base' ? 'M' : 'L'}
            </button>
          ))}

          <div className="relative ml-2" ref={settingsRef}>
            <button
              type="button"
              onClick={() => setShowSettingsMenu((prev) => !prev)}
              className="px-2 py-0.5 text-xs rounded-sm border border-paper-300 bg-paper-50 text-ink-600 hover:border-copper-400"
            >
              Settings
            </button>
            {showSettingsMenu && (
              <div className="absolute right-0 mt-1 z-30 w-44 rounded-sm border border-paper-300 bg-paper-50 shadow-md p-2">
                <div className="meta-label mb-1">Citation Style</div>
                <div className="space-y-1">
                  {CITATION_STYLE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setCitationStyle(option.id)
                        setShowSettingsMenu(false)
                      }}
                      className={`w-full text-left px-2 py-1 rounded-sm text-xs ${
                        citationStyle === option.id
                          ? 'bg-copper-100 text-copper-900'
                          : 'text-ink-600 hover:bg-paper-100'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-ink-500">Default: Chicago. Page numbers are added when detected.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {searchQuery && hasTranslation && !showTranslation && (
        <div className="px-4 py-2 bg-paper-100 border-b border-paper-200 text-xs text-ink-600">
          Search hits are pinned to original-text offsets, so this view defaults to the original source.
        </div>
      )}

      {/* Translation notice */}
      {showTranslation && translatedText && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs">
          <strong>LLM-generated translation</strong> — This translation was created by an AI language model.
          It may contain errors. Toggle above to view the original text.
        </div>
      )}

      {/* Translator note */}
      {showTranslation && translatorNote && showTranslatorNote && (
        <div className="px-4 py-3 border-b border-paper-200 bg-paper-100 text-ink-700 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold text-ink-800 text-xs uppercase tracking-wide mb-1">
              Translator’s Note (Written by GPT-5.2)
            </div>
            <button
              onClick={() => setShowTranslatorNote(false)}
              className="text-ink-400 hover:text-ink-600 text-xs"
              aria-label="Close translator note"
              title="Close"
            >
              Close
            </button>
          </div>
          <div className="font-serif leading-relaxed">{translatorNote}</div>
        </div>
      )}

      {/* Text content */}
      <div className={searchQuery ? 'grid lg:grid-cols-[minmax(0,1fr)_320px]' : ''}>
        <div
          className="p-6 md:p-8 max-h-[70vh] overflow-y-auto"
          onMouseUp={captureSelectionContext}
          onMouseDown={(event) => {
            const target = event.target as HTMLElement
            if (!target.closest('[data-paragraph-id]') && !target.closest('[data-inline-actions]')) {
              clearSelectionContext()
            }
          }}
        >
          <div className={`font-serif break-words ${fontSizeClasses[fontSize]}`} style={{ tabSize: 4 }}>
            {paragraphs.map((paragraph) => {
              const paragraphInlineTranslation = inlineTranslations[paragraph.id]
              const translated = Boolean(paragraphInlineTranslation)
              const visibleParagraphText = paragraphInlineTranslation?.translatedText || paragraph.text
              const paragraphHits = hitsByParagraph.get(paragraph.id) || []
              const toolbarVisible = activeToolbarParagraphId === paragraph.id
              const selectedText = selectionByParagraph[paragraph.id] || ''
              const isTranslating = translatingParagraphId === paragraph.id

              return (
                <section
                  key={`${paragraph.id}-${translated ? 'translated' : 'original'}`}
                  id={`paragraph-${paragraph.id}`}
                  data-paragraph-id={paragraph.id}
                  className="relative group py-1.5"
                  onMouseEnter={() => setHoveredParagraphId(paragraph.id)}
                  onMouseLeave={() => {
                    setHoveredParagraphId((prev) => (prev === paragraph.id ? null : prev))
                  }}
                >
                  {toolbarVisible && (
                    <div
                      data-inline-actions
                      className="absolute right-1 -top-2 z-20 inline-flex items-center gap-1 bg-paper-50/95 border border-paper-300 rounded-sm shadow-sm px-1.5 py-1 backdrop-blur"
                    >
                      <button
                        type="button"
                        className="px-2 py-0.5 text-[11px] font-sans text-ink-600 hover:text-copper-700"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void copyParagraph(paragraph.id)
                        }}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="px-2 py-0.5 text-[11px] font-sans text-ink-600 hover:text-copper-700"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void citeParagraph(paragraph.id)
                        }}
                      >
                        Cite
                      </button>
                      {canInlineTranslate && (
                        <button
                          type="button"
                          className="px-2 py-0.5 text-[11px] font-sans text-ink-600 hover:text-copper-700 disabled:opacity-50"
                          disabled={Boolean(translatingParagraphId) && !translated}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void toggleInlineTranslation(paragraph.id, true)
                          }}
                        >
                          {translated ? 'Original' : isTranslating ? 'Translating…' : selectedText ? 'Translate Selection' : 'Translate'}
                        </button>
                      )}
                    </div>
                  )}

                  <div
                    role="button"
                    tabIndex={0}
                    className={`w-full text-left transition-all duration-300 rounded-sm px-1 py-1 ${
                      translated ? 'bg-copper-50/60 border border-copper-200 animate-fade-in' : 'border border-transparent hover:border-paper-200'
                    }`}
                    onClick={() => handleParagraphClick(paragraph.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleParagraphClick(paragraph.id)
                      }
                    }}
                  >
                    {translated ? (
                      <>
                        <div className="meta-label mb-1 text-copper-700">
                          Inline translation {paragraphInlineTranslation?.mode === 'partial' ? '(selection)' : '(paragraph)'}
                        </div>
                        <p className="break-words">{visibleParagraphText}</p>
                        {/* Preserve hit anchor targets even when translated text is shown. */}
                        {paragraphHits.map((hit) => (
                          <span key={`translated-hit-anchor-${paragraph.id}-${hit.index}`} id={`text-hit-${hit.index}`} className="block h-0 overflow-hidden" aria-hidden />
                        ))}
                      </>
                    ) : (
                      <p className="break-words">
                        {renderTextWithHighlights(paragraph.text, paragraphHits, {
                          activeHitIndex,
                          idPrefix: 'text-hit',
                          className: 'search-highlight',
                          activeClassName: 'bg-copper-200 ring-1 ring-copper-500 ring-offset-1',
                        })}
                      </p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>

          {actionError && (
            <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-sm px-2 py-1.5 inline-block">
              {actionError}
            </div>
          )}
          {!actionError && actionNotice && (
            <div className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-sm px-2 py-1.5 inline-block">
              {actionNotice}
            </div>
          )}
        </div>

        {searchQuery && (
          <aside className="border-t lg:border-t-0 lg:border-l border-paper-200 max-h-[70vh] overflow-y-auto">
            <div className="px-4 py-3 border-b border-paper-200 bg-paper-100">
              <div className="meta-label mb-1">Search Hits</div>
              <p className="font-sans text-xs text-ink-600">
                {textHits.length} matches in this document
              </p>
            </div>

            {textHits.length > 0 ? (
              <div className="p-2 space-y-1.5">
                {textHits.map((hit) => (
                  <button
                    key={`hit-nav-${hit.index}-${hit.start}`}
                    type="button"
                    onClick={() => setActiveHitIndex(hit.index)}
                    className={`w-full text-left px-2 py-2 rounded-sm border transition-colors ${
                      hit.index === activeHitIndex
                        ? 'border-copper-400 bg-copper-50'
                        : 'border-transparent hover:border-paper-300 hover:bg-paper-100'
                    }`}
                  >
                    <div className="font-mono text-[11px] text-ink-500 mb-0.5">
                      #{hit.index + 1} · {hit.term} · @{hit.start.toLocaleString()}
                    </div>
                    <p className="font-serif text-xs text-ink-700 leading-relaxed">
                      {buildHitPreview(displayText || '', hit)}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-4 py-4 text-xs text-ink-500">
                No exact string matches for this query in the currently visible text.
              </p>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
