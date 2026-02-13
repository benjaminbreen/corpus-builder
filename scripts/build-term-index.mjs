#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'
import { analyzeOcrQuality, isNoisyOcr } from './lib/ocr-quality.mjs'
import { normalizeOcrText } from './lib/ocr-text-clean.mjs'

const ROOT = process.cwd()
const TERMS_CONFIG_FILE = path.join(ROOT, 'config', 'terms.yaml')
const CORPUS_INDEX_FILE = path.join(ROOT, 'public', 'data', 'corpus-index.json')
const RAW_TEXTS_DIR = path.join(ROOT, 'public', 'raw_texts')
const OUTPUT_DIR = path.join(ROOT, 'public', 'data')
const TERMS_OUTPUT_FILE = path.join(OUTPUT_DIR, 'terms.json')
const TERM_INDEX_OUTPUT_FILE = path.join(OUTPUT_DIR, 'term-index.json')

const MAX_MATCHES_PER_VARIANT = 120
const MAX_SNIPPETS_PER_DOC = 3
const MAX_EXCERPTS_PER_CONCEPT = 80
const SNIPPET_RADIUS = 140

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeConceptId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]+/g, '_')
}

function getDecade(year) {
  const numeric = Number(year)
  if (!Number.isFinite(numeric)) return 'unknown'
  return `${Math.floor(numeric / 10) * 10}s`
}

function qualityScore(doc) {
  const chars = Math.max(Number(doc.char_count) || 0, 200)
  const summaryBoost = doc.summary ? 0.25 : 0
  const translationBoost = doc.has_translation ? 0.2 : 0
  return Math.log10(chars) + summaryBoost + translationBoost
}

function buildVariantRegex(variant) {
  const escaped = escapeRegex(variant.trim()).replace(/\s+/g, '\\s+')
  return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'giu')
}

function collectMatches(text, variants) {
  const matches = []

  for (const variant of variants) {
    const regex = buildVariantRegex(variant)
    let m = regex.exec(text)
    let guard = 0

    while (m && guard < MAX_MATCHES_PER_VARIANT) {
      matches.push({
        variant,
        index: m.index,
        match: m[0],
      })
      guard += 1
      m = regex.exec(text)
    }
  }

  matches.sort((a, b) => a.index - b.index)
  return matches
}

function snippetForMatch(text, index, matchLength) {
  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(text.length, index + matchLength + SNIPPET_RADIUS)
  const raw = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${raw}${end < text.length ? '…' : ''}`
}

function toNumberMapSorted(record) {
  return Object.fromEntries(
    Object.entries(record)
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .map(([key, value]) => [key, Number(value)]),
  )
}

function makeConceptAccumulator(concept) {
  return {
    id: concept.id,
    label: concept.label,
    description: concept.description,
    total_hits: 0,
    documents_with_hits: 0,
    by_decade: {},
    by_language: {},
    by_topic: {},
    top_documents: [],
    key_excerpts: [],
    related_concepts: [],
    variant_count: concept.variantCount,
  }
}

async function loadTermsConfig() {
  const raw = await fs.readFile(TERMS_CONFIG_FILE, 'utf-8')
  const parsed = YAML.parse(raw)
  const concepts = Array.isArray(parsed?.concepts) ? parsed.concepts : []

  if (concepts.length === 0) {
    throw new Error(`No concepts defined in ${TERMS_CONFIG_FILE}`)
  }

  const seen = new Set()
  return concepts.map((entry) => {
    const id = normalizeConceptId(entry.id)
    if (!id) throw new Error('Every concept in config/terms.yaml must define a non-empty id')
    if (seen.has(id)) throw new Error(`Duplicate concept id in terms config: ${id}`)
    seen.add(id)

    const variants = entry.variants || {}
    const normalizedVariants = {}
    for (const [lang, values] of Object.entries(variants)) {
      if (!Array.isArray(values)) continue
      normalizedVariants[String(lang).toLowerCase()] = Array.from(
        new Set(values.map((v) => String(v).trim().toLowerCase()).filter(Boolean)),
      )
    }

    const variantCount = Object.values(normalizedVariants).reduce((sum, arr) => sum + arr.length, 0)

    return {
      id,
      label: entry.label || id,
      description: entry.description || '',
      variants: normalizedVariants,
      variantCount,
    }
  })
}

function getVariantsForLanguage(concept, lang) {
  const language = String(lang || '').toLowerCase()
  const fromAll = concept.variants.all || []
  const fromLang = concept.variants[language] || []
  const fromEnglish = language === 'en' ? [] : concept.variants.en || []
  return Array.from(new Set([...fromAll, ...fromLang, ...fromEnglish]))
}

async function readCorpus() {
  const raw = await fs.readFile(CORPUS_INDEX_FILE, 'utf-8')
  const docs = JSON.parse(raw)
  if (!Array.isArray(docs)) {
    throw new Error(`Invalid corpus index at ${CORPUS_INDEX_FILE}`)
  }
  return docs
}

function pushCount(record, key, delta = 1) {
  const normalized = String(key || 'unknown')
  record[normalized] = (record[normalized] || 0) + delta
}

async function main() {
  const [concepts, docs] = await Promise.all([loadTermsConfig(), readCorpus()])

  const conceptSummaries = new Map(concepts.map((c) => [c.id, makeConceptAccumulator(c)]))
  const termIndex = {}
  const cooccurrence = new Map()
  let skippedNoisyDocs = 0
  let cleanedMarkupDocs = 0

  for (const concept of concepts) {
    termIndex[concept.id] = {
      id: concept.id,
      label: concept.label,
      description: concept.description,
      documents: [],
    }
  }

  for (const doc of docs) {
    if (!doc.filename) continue

    const textPath = path.join(RAW_TEXTS_DIR, doc.filename)
    let rawText
    try {
      rawText = await fs.readFile(textPath, 'utf-8')
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

    const docConceptIds = []

    for (const concept of concepts) {
      const variants = getVariantsForLanguage(concept, doc.language_code)
      if (variants.length === 0) continue

      const matches = collectMatches(text, variants)
      if (matches.length === 0) continue

      docConceptIds.push(concept.id)

      const snippets = []
      for (const match of matches.slice(0, MAX_SNIPPETS_PER_DOC)) {
        snippets.push({
          variant: match.variant,
          start_char: match.index,
          end_char: match.index + match.match.length,
          text: snippetForMatch(text, match.index, match.match.length),
        })
      }

      const summary = conceptSummaries.get(concept.id)
      if (!summary) continue

      summary.total_hits += matches.length
      summary.documents_with_hits += 1
      pushCount(summary.by_decade, getDecade(doc.year))
      pushCount(summary.by_language, doc.language_code || 'unknown')
      pushCount(summary.by_topic, doc.topic || 'unknown')

      const docEntry = {
        doc_id: doc.identifier,
        title: doc.title,
        year: doc.year,
        decade: getDecade(doc.year),
        language_code: doc.language_code || 'unknown',
        topic: doc.topic || 'unknown',
        char_count: Number(doc.char_count) || 0,
        quality_score: Number(qualityScore(doc).toFixed(3)),
        hit_count: matches.length,
        snippets,
      }

      termIndex[concept.id].documents.push(docEntry)
    }

    if (docConceptIds.length > 1) {
      const unique = Array.from(new Set(docConceptIds)).sort()
      for (let i = 0; i < unique.length; i += 1) {
        for (let j = i + 1; j < unique.length; j += 1) {
          const key = `${unique[i]}::${unique[j]}`
          cooccurrence.set(key, (cooccurrence.get(key) || 0) + 1)
        }
      }
    }
  }

  const summaries = concepts.map((concept) => {
    const summary = conceptSummaries.get(concept.id)
    const docsForConcept = termIndex[concept.id].documents
      .sort((a, b) => b.hit_count - a.hit_count || a.year - b.year)

    const topDocs = docsForConcept.slice(0, 15).map((docEntry) => ({
      doc_id: docEntry.doc_id,
      title: docEntry.title,
      year: docEntry.year,
      language_code: docEntry.language_code,
      topic: docEntry.topic,
      hit_count: docEntry.hit_count,
      quality_score: docEntry.quality_score,
    }))

    const keyExcerpts = docsForConcept
      .flatMap((docEntry) =>
        docEntry.snippets.map((snippet) => ({
          doc_id: docEntry.doc_id,
          title: docEntry.title,
          year: docEntry.year,
          language_code: docEntry.language_code,
          topic: docEntry.topic,
          variant: snippet.variant,
          text: snippet.text,
          start_char: snippet.start_char,
          end_char: snippet.end_char,
        })),
      )
      .slice(0, MAX_EXCERPTS_PER_CONCEPT)

    const related = []
    for (const other of concepts) {
      if (other.id === concept.id) continue
      const [a, b] = [concept.id, other.id].sort()
      const key = `${a}::${b}`
      const count = cooccurrence.get(key) || 0
      if (count > 0) {
        related.push({ concept_id: other.id, count })
      }
    }

    related.sort((x, y) => y.count - x.count)

    return {
      ...summary,
      by_decade: toNumberMapSorted(summary.by_decade),
      by_language: toNumberMapSorted(summary.by_language),
      by_topic: toNumberMapSorted(summary.by_topic),
      top_documents: topDocs,
      key_excerpts: keyExcerpts,
      related_concepts: related.slice(0, 8),
    }
  })

  for (const concept of concepts) {
    termIndex[concept.id].documents.sort((a, b) => b.hit_count - a.hit_count || a.year - b.year)
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const termsPayload = {
    generated_at: new Date().toISOString(),
    corpus_size: docs.length,
    indexed_docs: docs.length - skippedNoisyDocs,
    skipped_noisy_docs: skippedNoisyDocs,
    cleaned_markup_docs: cleanedMarkupDocs,
    concepts: summaries,
  }

  const termIndexPayload = {
    generated_at: termsPayload.generated_at,
    corpus_size: docs.length,
    indexed_docs: docs.length - skippedNoisyDocs,
    skipped_noisy_docs: skippedNoisyDocs,
    concepts: termIndex,
  }

  await Promise.all([
    fs.writeFile(TERMS_OUTPUT_FILE, JSON.stringify(termsPayload, null, 2), 'utf-8'),
    fs.writeFile(TERM_INDEX_OUTPUT_FILE, JSON.stringify(termIndexPayload, null, 2), 'utf-8'),
  ])

  console.log(`Wrote ${TERMS_OUTPUT_FILE}`)
  console.log(`Wrote ${TERM_INDEX_OUTPUT_FILE}`)
  console.log(`Indexed ${summaries.length} concepts across ${docs.length - skippedNoisyDocs} documents`)
  if (skippedNoisyDocs > 0) {
    console.log(`Skipped ${skippedNoisyDocs} documents (noisy OCR)`)
  }
  if (cleanedMarkupDocs > 0) {
    console.log(`Cleaned OCR markup in ${cleanedMarkupDocs} documents`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
