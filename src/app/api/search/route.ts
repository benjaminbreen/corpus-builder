import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import OpenAI from 'openai'

export const runtime = 'nodejs'

const SEMANTIC_DIR = path.join(process.cwd(), 'data', 'semantic')
const CHUNKS_FILE = path.join(SEMANTIC_DIR, 'chunks.json')
const VECTORS_FILE = path.join(SEMANTIC_DIR, 'vectors.f32')
const META_FILE = path.join(SEMANTIC_DIR, 'meta.json')
const CORPUS_INDEX_FILE = path.join(process.cwd(), 'public', 'data', 'corpus-index.json')

const MAX_K = 80
const DEFAULT_K = 40
const DEFAULT_MAX_PER_DOC = 2
const DEFAULT_MAX_CHARS = 420
const MAX_QUERY_CHARS = 600

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 30

const EMBEDDING_CACHE_TTL_MS = 10 * 60_000
const EMBEDDING_CACHE_MAX_ITEMS = 200

type SemanticChunk = {
  doc_id: string
  chunk_id: string
  start_char: number
  end_char: number
  text: string
  title?: string
  year?: number
  topic?: string
  language_code?: string
}

type SemanticMeta = {
  model?: string
  dimensions?: number
  dim?: number
}

type CorpusDoc = {
  identifier: string
  title: string
  year: number
  topic?: string
  language_code?: string
  char_count?: number
  summary?: string | null
  has_translation?: boolean
}

type CorpusDocExtended = CorpusDoc & {
  quality_score: number
  quality_percentile: number
}

type SearchFilters = {
  topic?: string
  language?: string
  decade?: string
}

type SearchBody = {
  query?: string
  k?: number
  maxChars?: number
  maxPerDoc?: number
  includeLowQuality?: boolean
  filters?: SearchFilters
}

type Candidate = {
  chunk: SemanticChunk
  doc: CorpusDocExtended
  semanticRaw: number
  lexicalRaw: number
}

type SearchIndex = {
  chunks: SemanticChunk[]
  vectors: Float32Array
  dimensions: number
  model: string
}

let searchIndexPromise: Promise<SearchIndex> | null = null
let docsMapCache: Map<string, CorpusDocExtended> | null = null

const requestLog = new Map<string, number[]>()
const embeddingCache = new Map<string, { vector: Float32Array; createdAt: number }>()

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'local'
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entries = requestLog.get(ip) || []
  const fresh = entries.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS)

  if (fresh.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, fresh)
    return true
  }

  fresh.push(now)
  requestLog.set(ip, fresh)

  if (requestLog.size > 1000) {
    requestLog.forEach((values, key) => {
      const retained = values.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS)
      if (retained.length === 0) {
        requestLog.delete(key)
      } else {
        requestLog.set(key, retained)
      }
    })
  }

  return false
}

function normalizeVector(values: number[]): Float32Array {
  let sumSquares = 0
  for (const value of values) {
    sumSquares += value * value
  }
  const norm = Math.sqrt(sumSquares) || 1
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i += 1) {
    out[i] = values[i] / norm
  }
  return out
}

function dotProduct(vectors: Float32Array, offset: number, query: Float32Array, dim: number): number {
  let total = 0
  for (let i = 0; i < dim; i += 1) {
    total += vectors[offset + i] * query[i]
  }
  return total
}

function truncateSnippet(text: string, maxChars: number, queryLower: string, queryTokens: string[]): string {
  if (text.length <= maxChars) return text

  const lower = text.toLowerCase()
  let matchIndex = queryLower ? lower.indexOf(queryLower) : -1

  if (matchIndex === -1) {
    for (const token of queryTokens) {
      const tokenIndex = lower.indexOf(token)
      if (tokenIndex !== -1 && (matchIndex === -1 || tokenIndex < matchIndex)) {
        matchIndex = tokenIndex
      }
    }
  }

  if (matchIndex === -1) {
    const clipped = text.slice(0, maxChars)
    return `${clipped.replace(/\s+\S*$/, '').trimEnd()}…`
  }

  let start = Math.max(0, matchIndex - Math.floor(maxChars * 0.35))
  let end = Math.min(text.length, start + maxChars)

  if (end === text.length) {
    start = Math.max(0, end - maxChars)
  }

  const snippet = text.slice(start, end).trim()
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${snippet}${suffix}`
}

function tokenizeQuery(query: string): string[] {
  const normalized = query
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')

  const parts = normalized.split(/\s+/).map((part) => part.trim()).filter(Boolean)
  return Array.from(new Set(parts.filter((token) => token.length >= 2)))
}

function lexicalScore(chunkTextLower: string, queryLower: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0

  let covered = 0
  let frequency = 0

  for (const token of queryTokens) {
    if (chunkTextLower.includes(token)) {
      covered += 1
      let from = 0
      while (true) {
        const found = chunkTextLower.indexOf(token, from)
        if (found === -1) break
        frequency += 1
        from = found + token.length
      }
    }
  }

  const coverageRatio = covered / queryTokens.length
  const freqRatio = Math.min(frequency / (queryTokens.length * 2), 1)
  const phraseBonus = chunkTextLower.includes(queryLower) ? 0.75 : 0

  return coverageRatio + freqRatio + phraseBonus
}

function qualityScore(doc: CorpusDoc): number {
  const chars = Math.max(Number(doc.char_count) || 0, 200)
  const summaryBoost = doc.summary ? 0.25 : 0
  const translationBoost = doc.has_translation ? 0.2 : 0
  return Math.log10(chars) + summaryBoost + translationBoost
}

function decadeOfYear(year: number): string {
  return `${Math.floor(year / 10) * 10}s`
}

function passesFilters(chunk: SemanticChunk, doc: CorpusDocExtended, filters?: SearchFilters): boolean {
  if (!filters) return true

  if (filters.topic && (chunk.topic || doc.topic) !== filters.topic) {
    return false
  }

  if (filters.language && (chunk.language_code || doc.language_code) !== filters.language) {
    return false
  }

  if (filters.decade) {
    const year = Number(chunk.year || doc.year)
    if (Number.isFinite(year) && decadeOfYear(year) !== filters.decade) {
      return false
    }
  }

  return true
}

function ensureOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  return new OpenAI({ apiKey: key })
}

function loadCorpusDocs(): Map<string, CorpusDocExtended> {
  if (docsMapCache) return docsMapCache

  if (!fs.existsSync(CORPUS_INDEX_FILE)) {
    docsMapCache = new Map()
    return docsMapCache
  }

  const docs = JSON.parse(fs.readFileSync(CORPUS_INDEX_FILE, 'utf-8')) as CorpusDoc[]
  const scored = docs.map((doc) => ({ doc, score: qualityScore(doc) }))
  const sortedScores = [...scored].sort((a, b) => a.score - b.score)

  const percentileById = new Map<string, number>()
  const denominator = Math.max(sortedScores.length - 1, 1)
  for (let i = 0; i < sortedScores.length; i += 1) {
    percentileById.set(sortedScores[i].doc.identifier, i / denominator)
  }

  docsMapCache = new Map(
    docs.map((doc) => [
      doc.identifier,
      {
        ...doc,
        quality_score: Number(qualityScore(doc).toFixed(3)),
        quality_percentile: Number((percentileById.get(doc.identifier) || 0).toFixed(3)),
      },
    ]),
  )

  return docsMapCache
}

async function loadSearchIndex(): Promise<SearchIndex> {
  if (!fs.existsSync(CHUNKS_FILE) || !fs.existsSync(VECTORS_FILE) || !fs.existsSync(META_FILE)) {
    throw new Error('Search index files are missing. Run `npm run build:semantic-index`.')
  }

  const chunks = JSON.parse(fs.readFileSync(CHUNKS_FILE, 'utf-8')) as SemanticChunk[]
  const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf-8')) as SemanticMeta
  const dimensions = Number(meta.dimensions ?? meta.dim)
  if (!Number.isFinite(dimensions) || dimensions < 1) {
    throw new Error('Invalid semantic index metadata')
  }

  const vectorBuffer = fs.readFileSync(VECTORS_FILE)
  if (vectorBuffer.byteLength % 4 !== 0) {
    throw new Error('Invalid vectors.f32 file size')
  }

  const view = new Float32Array(vectorBuffer.buffer, vectorBuffer.byteOffset, vectorBuffer.byteLength / 4)
  const vectors = new Float32Array(view.length)
  vectors.set(view)

  if (vectors.length !== chunks.length * dimensions) {
    throw new Error('Search index mismatch between chunk and vector counts')
  }

  return {
    chunks,
    vectors,
    dimensions,
    model: meta.model || process.env.SEMANTIC_EMBED_MODEL || 'text-embedding-3-small',
  }
}

async function getSearchIndex(): Promise<SearchIndex> {
  if (!searchIndexPromise) {
    searchIndexPromise = loadSearchIndex()
  }
  return searchIndexPromise
}

function readCachedEmbedding(cacheKey: string): Float32Array | null {
  const entry = embeddingCache.get(cacheKey)
  if (!entry) return null

  if (Date.now() - entry.createdAt > EMBEDDING_CACHE_TTL_MS) {
    embeddingCache.delete(cacheKey)
    return null
  }

  embeddingCache.delete(cacheKey)
  embeddingCache.set(cacheKey, entry)
  return entry.vector
}

function writeCachedEmbedding(cacheKey: string, vector: Float32Array) {
  while (embeddingCache.size >= EMBEDDING_CACHE_MAX_ITEMS) {
    const oldestKey = embeddingCache.keys().next().value
    if (!oldestKey) break
    embeddingCache.delete(oldestKey)
  }

  embeddingCache.set(cacheKey, { vector, createdAt: Date.now() })
}

async function getQueryEmbedding(query: string, model: string): Promise<Float32Array | null> {
  const client = ensureOpenAIClient()
  if (!client) return null

  const cacheKey = `${model}::${query.toLowerCase()}`
  const cached = readCachedEmbedding(cacheKey)
  if (cached) return cached

  const response = await client.embeddings.create({ model, input: query })
  const embedding = response.data?.[0]?.embedding
  if (!embedding) return null

  const normalized = normalizeVector(embedding)
  writeCachedEmbedding(cacheKey, normalized)
  return normalized
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Too many requests. Please retry in a minute.' }, { status: 429 })
    }

    let body: SearchBody
    try {
      body = (await req.json()) as SearchBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    const query = String(body.query || '').trim().replace(/\s+/g, ' ')
    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    }
    if (query.length > MAX_QUERY_CHARS) {
      return NextResponse.json({ error: `Query too long (max ${MAX_QUERY_CHARS} chars)` }, { status: 400 })
    }

    const k = clamp(Number(body.k ?? DEFAULT_K), 1, MAX_K)
    const maxPerDoc = clamp(Number(body.maxPerDoc ?? DEFAULT_MAX_PER_DOC), 1, 5)
    const maxChars = clamp(Number(body.maxChars ?? DEFAULT_MAX_CHARS), 120, 1200)
    const includeLowQuality = Boolean(body.includeLowQuality)

    const filters: SearchFilters = {
      topic: body.filters?.topic || undefined,
      language: body.filters?.language || undefined,
      decade: body.filters?.decade || undefined,
    }

    const [index, docsMap] = await Promise.all([getSearchIndex(), Promise.resolve(loadCorpusDocs())])

    const queryTokens = tokenizeQuery(query)
    const queryLower = query.toLowerCase()

    let queryEmbedding: Float32Array | null = null
    let usedSemantic = false

    try {
      queryEmbedding = await getQueryEmbedding(query, index.model)
      usedSemantic = Boolean(queryEmbedding)
    } catch {
      queryEmbedding = null
      usedSemantic = false
    }

    if (queryEmbedding && queryEmbedding.length !== index.dimensions) {
      return NextResponse.json(
        {
          error: `Embedding dimension mismatch: query=${queryEmbedding.length}, index=${index.dimensions}. Rebuild semantic index with model ${index.model}.`,
        },
        { status: 500 },
      )
    }

    const candidates: Candidate[] = []

    for (let i = 0; i < index.chunks.length; i += 1) {
      const chunk = index.chunks[i]
      const doc = docsMap.get(chunk.doc_id)
      if (!doc) continue

      if (!includeLowQuality && doc.quality_percentile < 0.1) {
        continue
      }

      if (!passesFilters(chunk, doc, filters)) {
        continue
      }

      const textLower = chunk.text.toLowerCase()
      const lexicalRaw = lexicalScore(textLower, queryLower, queryTokens)
      const semanticRaw = queryEmbedding
        ? dotProduct(index.vectors, i * index.dimensions, queryEmbedding, index.dimensions)
        : 0

      if (lexicalRaw <= 0 && semanticRaw <= 0.05) {
        continue
      }

      candidates.push({ chunk, doc, semanticRaw, lexicalRaw })
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        query,
        model: index.model,
        used_semantic: usedSemantic,
        results: [],
      })
    }

    const maxLexical = Math.max(...candidates.map((c) => c.lexicalRaw), 0.0001)

    const ranked = candidates
      .map((candidate) => {
        const semanticComponent = queryEmbedding ? (candidate.semanticRaw + 1) / 2 : 0
        const lexicalComponent = candidate.lexicalRaw / maxLexical
        const qualityComponent = candidate.doc.quality_percentile

        const weights = usedSemantic
          ? { semantic: 0.45, lexical: 0.35, quality: 0.2 }
          : { semantic: 0, lexical: 0.75, quality: 0.25 }

        const score =
          semanticComponent * weights.semantic +
          lexicalComponent * weights.lexical +
          qualityComponent * weights.quality

        return {
          candidate,
          score,
          components: {
            semantic: semanticComponent,
            lexical: lexicalComponent,
            quality: qualityComponent,
          },
        }
      })
      .sort((a, b) => b.score - a.score)

    const perDoc = new Map<string, number>()
    const results = []

    for (const row of ranked) {
      const docId = row.candidate.chunk.doc_id
      const seen = perDoc.get(docId) || 0
      if (seen >= maxPerDoc) continue

      perDoc.set(docId, seen + 1)

      const chunk = row.candidate.chunk
      const doc = row.candidate.doc

      results.push({
        doc_id: docId,
        chunk_id: chunk.chunk_id,
        start_char: chunk.start_char,
        end_char: chunk.end_char,
        title: chunk.title || doc.title,
        year: chunk.year || doc.year,
        topic: chunk.topic || doc.topic,
        language_code: chunk.language_code || doc.language_code,
        text: truncateSnippet(chunk.text, maxChars, queryLower, queryTokens),
        score: Number(row.score.toFixed(4)),
        semantic_score: Number(row.components.semantic.toFixed(4)),
        lexical_score: Number(row.components.lexical.toFixed(4)),
        quality_prior: Number(row.components.quality.toFixed(4)),
        quality_percentile: doc.quality_percentile,
      })

      if (results.length >= k) break
    }

    return NextResponse.json({
      query,
      model: index.model,
      used_semantic: usedSemantic,
      include_low_quality: includeLowQuality,
      filters,
      total_candidates: candidates.length,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 },
    )
  }
}
