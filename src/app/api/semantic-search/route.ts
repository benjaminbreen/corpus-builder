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

const MAX_K = 50
const DEFAULT_K = 12
const MAX_QUERY_CHARS = 600
const DEFAULT_MAX_CHARS = 420
const DEFAULT_MAX_PER_DOC = 2

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
  count?: number
}

type CorpusDoc = {
  identifier: string
  title: string
  year: number
  topic?: string
  language_code?: string
}

type SemanticIndex = {
  meta: SemanticMeta
  chunks: SemanticChunk[]
  vectors: Float32Array
  dimensions: number
}

type SearchFilters = {
  topic?: string
  language_code?: string
  decade?: string | number
}

type SearchRequestBody = {
  query?: string
  k?: number
  maxChars?: number
  maxPerDoc?: number
  filters?: SearchFilters
}

let semanticIndexPromise: Promise<SemanticIndex> | null = null
let corpusDocMap: Map<string, CorpusDoc> | null = null

const requestLog = new Map<string, number[]>()
const embeddingCache = new Map<string, { vector: Float32Array; createdAt: number }>()

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    return xff.split(',')[0].trim()
  }
  return req.headers.get('x-real-ip') || 'local'
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entries = requestLog.get(ip) || []
  const fresh = entries.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)

  if (fresh.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, fresh)
    return true
  }

  fresh.push(now)
  requestLog.set(ip, fresh)

  if (requestLog.size > 1000) {
    requestLog.forEach((values, key) => {
      const retained = values.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
      if (retained.length === 0) {
        requestLog.delete(key)
      } else {
        requestLog.set(key, retained)
      }
    })
  }

  return false
}

function normalizeVector(vector: number[]): Float32Array {
  let sumSquares = 0
  for (const value of vector) {
    sumSquares += value * value
  }
  const norm = Math.sqrt(sumSquares) || 1

  const normalized = new Float32Array(vector.length)
  for (let i = 0; i < vector.length; i += 1) {
    normalized[i] = vector[i] / norm
  }
  return normalized
}

function truncateSnippet(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const clipped = text.slice(0, maxChars)
  return `${clipped.replace(/\s+\S*$/, '').trimEnd()}…`
}

function parseDecade(input: string | number | undefined): string | null {
  if (input === undefined || input === null) return null
  if (typeof input === 'number' && Number.isFinite(input)) {
    return `${Math.floor(input / 10) * 10}s`
  }

  const normalized = String(input).trim().toLowerCase()
  if (!normalized) return null

  if (/^\d{4}s$/.test(normalized)) return normalized
  if (/^\d{4}$/.test(normalized)) {
    return `${Math.floor(Number(normalized) / 10) * 10}s`
  }

  return normalized
}

function chunkPassesFilters(chunk: SemanticChunk, filters?: SearchFilters): boolean {
  if (!filters) return true

  if (filters.topic && chunk.topic !== filters.topic) {
    return false
  }

  if (filters.language_code && chunk.language_code !== filters.language_code) {
    return false
  }

  const decadeFilter = parseDecade(filters.decade)
  if (decadeFilter && chunk.year !== undefined) {
    const chunkDecade = `${Math.floor(chunk.year / 10) * 10}s`
    if (chunkDecade !== decadeFilter) {
      return false
    }
  }

  return true
}

function dotProduct(vectors: Float32Array, offset: number, query: Float32Array, dimensions: number): number {
  let score = 0
  for (let i = 0; i < dimensions; i += 1) {
    score += vectors[offset + i] * query[i]
  }
  return score
}

function ensureOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing on the server')
  }
  return new OpenAI({ apiKey })
}

function loadCorpusIndex(): Map<string, CorpusDoc> {
  if (corpusDocMap) return corpusDocMap

  if (!fs.existsSync(CORPUS_INDEX_FILE)) {
    corpusDocMap = new Map()
    return corpusDocMap
  }

  const raw = fs.readFileSync(CORPUS_INDEX_FILE, 'utf-8')
  const docs = JSON.parse(raw) as CorpusDoc[]
  corpusDocMap = new Map(docs.map((doc) => [doc.identifier, doc]))
  return corpusDocMap
}

async function loadSemanticIndex(): Promise<SemanticIndex> {
  if (!fs.existsSync(CHUNKS_FILE) || !fs.existsSync(VECTORS_FILE) || !fs.existsSync(META_FILE)) {
    throw new Error('Semantic index files are missing. Run `npm run build:semantic-index`.')
  }

  const chunks = JSON.parse(fs.readFileSync(CHUNKS_FILE, 'utf-8')) as SemanticChunk[]
  const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf-8')) as SemanticMeta

  const dimensions = Number(meta.dimensions ?? meta.dim)
  if (!Number.isFinite(dimensions) || dimensions < 1) {
    throw new Error('Invalid semantic index metadata: dimensions missing or invalid')
  }

  const vectorBuffer = fs.readFileSync(VECTORS_FILE)
  if (vectorBuffer.byteLength % 4 !== 0) {
    throw new Error('Invalid vectors.f32 file size')
  }

  const view = new Float32Array(vectorBuffer.buffer, vectorBuffer.byteOffset, vectorBuffer.byteLength / 4)
  const vectors = new Float32Array(view.length)
  vectors.set(view)

  if (chunks.length * dimensions !== vectors.length) {
    throw new Error(
      `Semantic index mismatch: expected ${chunks.length * dimensions} floats, got ${vectors.length}`,
    )
  }

  return { meta, chunks, vectors, dimensions }
}

async function getSemanticIndex(): Promise<SemanticIndex> {
  if (!semanticIndexPromise) {
    semanticIndexPromise = loadSemanticIndex()
  }
  return semanticIndexPromise
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
    const firstKey = embeddingCache.keys().next().value
    if (!firstKey) break
    embeddingCache.delete(firstKey)
  }

  embeddingCache.set(cacheKey, { vector, createdAt: Date.now() })
}

async function getQueryEmbedding(query: string, model: string): Promise<Float32Array> {
  const cacheKey = `${model}::${query.toLowerCase()}`
  const cached = readCachedEmbedding(cacheKey)
  if (cached) return cached

  const client = ensureOpenAIClient()
  const response = await client.embeddings.create({ model, input: query })
  const embedding = response.data?.[0]?.embedding

  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('OpenAI did not return an embedding vector')
  }

  const vector = normalizeVector(embedding)
  writeCachedEmbedding(cacheKey, vector)
  return vector
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Too many requests. Please retry in a minute.' }, { status: 429 })
    }

    let body: SearchRequestBody
    try {
      body = (await req.json()) as SearchRequestBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    const query = String(body.query || '').trim().replace(/\s+/g, ' ')
    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    }
    if (query.length > MAX_QUERY_CHARS) {
      return NextResponse.json(
        { error: `Query too long. Maximum ${MAX_QUERY_CHARS} characters.` },
        { status: 400 },
      )
    }

    const k = clamp(Number(body.k ?? DEFAULT_K), 1, MAX_K)
    const maxChars = clamp(Number(body.maxChars ?? DEFAULT_MAX_CHARS), 120, 1200)
    const maxPerDoc = clamp(Number(body.maxPerDoc ?? DEFAULT_MAX_PER_DOC), 1, 5)

    let index: SemanticIndex
    try {
      index = await getSemanticIndex()
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Semantic index not available' },
        { status: 503 },
      )
    }

    const model = process.env.SEMANTIC_EMBED_MODEL || index.meta.model || 'text-embedding-3-small'
    const queryVector = await getQueryEmbedding(query, model)

    if (queryVector.length !== index.dimensions) {
      return NextResponse.json(
        {
          error: `Embedding dimension mismatch: query=${queryVector.length}, index=${index.dimensions}. Rebuild with model ${model}.`,
        },
        { status: 500 },
      )
    }

    const ranked: Array<{ chunkIndex: number; score: number }> = []
    for (let i = 0; i < index.chunks.length; i += 1) {
      const chunk = index.chunks[i]
      if (!chunkPassesFilters(chunk, body.filters)) continue
      const score = dotProduct(index.vectors, i * index.dimensions, queryVector, index.dimensions)
      ranked.push({ chunkIndex: i, score })
    }

    ranked.sort((a, b) => b.score - a.score)

    const docs = loadCorpusIndex()
    const perDocCounts = new Map<string, number>()
    const results = []

    for (const candidate of ranked) {
      const chunk = index.chunks[candidate.chunkIndex]
      const docHits = perDocCounts.get(chunk.doc_id) || 0
      if (docHits >= maxPerDoc) continue

      const doc = docs.get(chunk.doc_id)
      results.push({
        doc_id: chunk.doc_id,
        chunk_id: chunk.chunk_id,
        start_char: chunk.start_char,
        end_char: chunk.end_char,
        score: candidate.score,
        text: truncateSnippet(chunk.text, maxChars),
        title: chunk.title || doc?.title,
        year: chunk.year || doc?.year,
        topic: chunk.topic || doc?.topic,
        language_code: chunk.language_code || doc?.language_code,
      })

      perDocCounts.set(chunk.doc_id, docHits + 1)
      if (results.length >= k) break
    }

    return NextResponse.json({
      query,
      model,
      results,
      total_candidates: ranked.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Semantic search failed' },
      { status: 500 },
    )
  }
}
