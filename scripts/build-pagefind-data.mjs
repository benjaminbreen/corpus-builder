#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { analyzeOcrQuality, isNoisyOcr } from './lib/ocr-quality.mjs'
import { normalizeOcrText } from './lib/ocr-text-clean.mjs'

const ROOT = process.cwd()
const CORPUS_INDEX_FILE = path.join(ROOT, 'public', 'data', 'corpus-index.json')
const RAW_TEXTS_DIR = path.join(ROOT, 'public', 'raw_texts')
const OUTPUT_DIR = path.join(ROOT, 'public', 'texts')

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function decadeForYear(year) {
  const numeric = Number(year)
  if (!Number.isFinite(numeric)) return 'unknown'
  return `${Math.floor(numeric / 10) * 10}s`
}

async function main() {
  const raw = await fs.readFile(CORPUS_INDEX_FILE, 'utf-8')
  const docs = JSON.parse(raw)

  await fs.rm(OUTPUT_DIR, { recursive: true, force: true })
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  let written = 0
  let skipped = 0
  let skippedNoisy = 0
  let cleanedMarkupDocs = 0

  for (const doc of docs) {
    if (!doc.filename) {
      skipped += 1
      continue
    }

    const textPath = path.join(RAW_TEXTS_DIR, doc.filename)
    let rawText
    try {
      rawText = await fs.readFile(textPath, 'utf-8')
    } catch {
      skipped += 1
      continue
    }

    const text = normalizeOcrText(rawText)
    if (text !== rawText) {
      cleanedMarkupDocs += 1
    }

    const quality = analyzeOcrQuality(text)
    if (isNoisyOcr(quality)) {
      skippedNoisy += 1
      continue
    }

    const html = `<!DOCTYPE html>
<html lang="${escapeHtml(doc.language_code || 'en')}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(doc.title || doc.identifier)}</title>
</head>
<body>
  <article
    data-pagefind-body
    data-pagefind-meta="title:${escapeHtml(doc.title || doc.identifier)}"
    data-pagefind-filter="year:${escapeHtml(String(doc.year || 'unknown'))}"
    data-pagefind-filter="decade:${escapeHtml(decadeForYear(doc.year))}"
    data-pagefind-filter="topic:${escapeHtml(doc.topic || 'unknown')}"
    data-pagefind-filter="language:${escapeHtml(doc.language_code || 'unknown')}"
    data-pagefind-sort="year:${escapeHtml(String(doc.year || 0))}"
  >
    <h1>${escapeHtml(doc.title || doc.identifier)}</h1>
    <div class="metadata">
      <span class="year">${escapeHtml(String(doc.year || 'unknown'))}</span>
      <span class="creator">${escapeHtml(doc.creator || 'Unknown')}</span>
      <span class="topic">${escapeHtml(doc.topic || 'unknown')}</span>
      <span class="language">${escapeHtml(doc.language_code || 'unknown')}</span>
    </div>
    <div class="content"><pre>${escapeHtml(text)}</pre></div>
  </article>
</body>
</html>
`

    await fs.writeFile(path.join(OUTPUT_DIR, `${doc.identifier}.html`), html, 'utf-8')
    written += 1
  }

  console.log(`Created ${written} Pagefind source files in ${OUTPUT_DIR}`)
  if (skipped > 0) {
    console.log(`Skipped ${skipped} documents (missing filename or text file)`)
  }
  if (skippedNoisy > 0) {
    console.log(`Skipped ${skippedNoisy} documents (noisy OCR)`)
  }
  if (cleanedMarkupDocs > 0) {
    console.log(`Cleaned OCR markup in ${cleanedMarkupDocs} documents`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
