#!/usr/bin/env node

import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import OpenAI from 'openai'
import { analyzeOcrQuality, isNoisyOcr } from './lib/ocr-quality.mjs'
import { normalizeOcrText } from './lib/ocr-text-clean.mjs'

const ROOT = process.cwd()
const CORPUS_INDEX_FILE = path.join(ROOT, 'public', 'data', 'corpus-index.json')
const RAW_TEXT_DIR = path.join(ROOT, 'public', 'raw_texts')
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'data', 'semantic')

function loadLocalEnv(filePath) {
  try {
    const raw = fsSync.readFileSync(filePath, 'utf-8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      if (!key || process.env[key] !== undefined) continue
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch {
    // Ignore missing env file
  }
}

function parseArgs(argv) {
  const options = {
    model: process.env.SEMANTIC_EMBED_MODEL || 'text-embedding-3-small',
    chunkChars: 1600,
    overlapChars: 220,
    minChunkChars: 240,
    maxChunksPerDoc: 24,
    batchSize: 64,
    maxDocs: null,
    languages: null,
    outputDir: DEFAULT_OUTPUT_DIR,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]

    if (arg === '--model' && next) {
      options.model = next
      i += 1
      continue
    }
    if (arg === '--chunk-chars' && next) {
      options.chunkChars = Number(next)
      i += 1
      continue
    }
    if (arg === '--overlap-chars' && next) {
      options.overlapChars = Number(next)
      i += 1
      continue
    }
    if (arg === '--min-chunk-chars' && next) {
      options.minChunkChars = Number(next)
      i += 1
      continue
    }
    if (arg === '--max-chunks-per-doc' && next) {
      options.maxChunksPerDoc = Number(next)
      i += 1
      continue
    }
    if (arg === '--batch-size' && next) {
      options.batchSize = Number(next)
      i += 1
      continue
    }
    if (arg === '--max-docs' && next) {
      options.maxDocs = Number(next)
      i += 1
      continue
    }
    if (arg === '--languages' && next) {
      options.languages = new Set(next.split(',').map((v) => v.trim()).filter(Boolean))
      i += 1
      continue
    }
    if (arg === '--output-dir' && next) {
      options.outputDir = path.resolve(ROOT, next)
      i += 1
    }
  }

  if (options.chunkChars < 200) throw new Error('--chunk-chars must be >= 200')
  if (options.overlapChars < 0 || options.overlapChars >= options.chunkChars) {
    throw new Error('--overlap-chars must be >= 0 and < --chunk-chars')
  }
  if (options.batchSize < 1 || options.batchSize > 128) throw new Error('--batch-size must be between 1 and 128')
  if (options.maxChunksPerDoc < 1) throw new Error('--max-chunks-per-doc must be >= 1')

  return options
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function chunkText(text, { chunkChars, overlapChars, minChunkChars }) {
  const chunks = []
  const len = text.length
  const step = Math.max(1, chunkChars - overlapChars)

  let start = 0
  while (start < len) {
    let end = Math.min(len, start + chunkChars)
    if (end < len) {
      const lastSpace = text.lastIndexOf(' ', end)
      if (lastSpace > start + Math.floor(chunkChars * 0.55)) {
        end = lastSpace
      }
    }

    const segment = text.slice(start, end).trim()
    if (segment.length >= minChunkChars) {
      chunks.push({ start_char: start, end_char: end, text: segment })
    }

    if (end >= len) break
    start += step
  }

  return chunks
}

function sampleEvenly(items, maxItems) {
  if (items.length <= maxItems) return items
  if (maxItems === 1) return [items[0]]

  const selected = []
  for (let i = 0; i < maxItems; i += 1) {
    const idx = Math.round((i * (items.length - 1)) / (maxItems - 1))
    selected.push(items[idx])
  }
  return selected
}

function normalizeVector(values) {
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

async function embedBatch(client, model, texts, retries = 4) {
  let attempt = 0
  while (true) {
    try {
      const response = await client.embeddings.create({
        model,
        input: texts,
      })
      return response
    } catch (error) {
      attempt += 1
      if (attempt > retries) throw error
      const waitMs = 1000 * (2 ** (attempt - 1))
      console.warn(`Embedding batch failed (attempt ${attempt}/${retries + 1}). Retrying in ${waitMs}ms...`)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
}

async function main() {
  loadLocalEnv(path.join(ROOT, '.env.local'))
  const options = parseArgs(process.argv.slice(2))

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing. Add it to .env.local or your shell environment.')
  }

  const indexRaw = await fs.readFile(CORPUS_INDEX_FILE, 'utf-8')
  const docs = JSON.parse(indexRaw)

  const filteredDocs = docs
    .filter((doc) => doc.filename)
    .filter((doc) => !options.languages || options.languages.has(doc.language_code))

  const selectedDocs = options.maxDocs ? filteredDocs.slice(0, options.maxDocs) : filteredDocs

  const chunks = []
  let skippedNoisyDocs = 0
  let cleanedMarkupDocs = 0
  for (const doc of selectedDocs) {
    const filePath = path.join(RAW_TEXT_DIR, doc.filename)
    let rawText
    try {
      rawText = await fs.readFile(filePath, 'utf-8')
    } catch {
      continue
    }

    const text = normalizeOcrText(rawText)
    if (text !== rawText) {
      cleanedMarkupDocs += 1
    }

    const ocrQuality = analyzeOcrQuality(text)
    if (isNoisyOcr(ocrQuality)) {
      skippedNoisyDocs += 1
      continue
    }

    const normalized = normalizeWhitespace(text)
    if (!normalized) continue

    const allChunks = chunkText(normalized, options)
    const docChunks = sampleEvenly(allChunks, options.maxChunksPerDoc)

    for (let i = 0; i < docChunks.length; i += 1) {
      const chunk = docChunks[i]
      chunks.push({
        doc_id: doc.identifier,
        chunk_id: `${doc.identifier}_${i}`,
        start_char: chunk.start_char,
        end_char: chunk.end_char,
        text: chunk.text,
        title: doc.title,
        year: doc.year,
        topic: doc.topic,
        language_code: doc.language_code,
      })
    }
  }

  if (chunks.length === 0) {
    throw new Error('No chunks were generated. Check public/data/corpus-index.json and public/raw_texts/.')
  }

  console.log(`Prepared ${chunks.length} chunks from ${selectedDocs.length - skippedNoisyDocs} documents`)
  if (skippedNoisyDocs > 0) {
    console.log(`Skipped ${skippedNoisyDocs} documents (noisy OCR)`)
  }
  if (cleanedMarkupDocs > 0) {
    console.log(`Cleaned OCR markup in ${cleanedMarkupDocs} documents`)
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const vectors = []

  for (let start = 0; start < chunks.length; start += options.batchSize) {
    const batch = chunks.slice(start, start + options.batchSize)
    const texts = batch.map((chunk) => chunk.text)

    const response = await embedBatch(client, options.model, texts)
    if (!response.data || response.data.length !== texts.length) {
      throw new Error(`Unexpected embedding response size at batch starting ${start}`)
    }

    for (const row of response.data) {
      vectors.push(normalizeVector(row.embedding))
    }

    console.log(`Embedded ${Math.min(start + batch.length, chunks.length)}/${chunks.length}`)
  }

  const dimensions = vectors[0].length
  const flat = new Float32Array(vectors.length * dimensions)
  for (let i = 0; i < vectors.length; i += 1) {
    flat.set(vectors[i], i * dimensions)
  }

  await fs.mkdir(options.outputDir, { recursive: true })

  const chunksFile = path.join(options.outputDir, 'chunks.json')
  const vectorsFile = path.join(options.outputDir, 'vectors.f32')
  const metaFile = path.join(options.outputDir, 'meta.json')

  await fs.writeFile(chunksFile, JSON.stringify(chunks, null, 2), 'utf-8')
  await fs.writeFile(vectorsFile, Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength))
  await fs.writeFile(
    metaFile,
    JSON.stringify(
      {
        model: options.model,
        dimensions,
        count: chunks.length,
        chunk_chars: options.chunkChars,
        overlap_chars: options.overlapChars,
        max_chunks_per_doc: options.maxChunksPerDoc,
        languages: options.languages ? Array.from(options.languages) : null,
        skipped_noisy_docs: skippedNoisyDocs,
        cleaned_markup_docs: cleanedMarkupDocs,
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf-8',
  )

  console.log(`Wrote ${chunksFile}`)
  console.log(`Wrote ${vectorsFile}`)
  console.log(`Wrote ${metaFile}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
