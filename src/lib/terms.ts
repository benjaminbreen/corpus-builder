import { promises as fs } from 'fs'
import path from 'path'

export type RelatedConcept = {
  concept_id: string
  count: number
}

export type ConceptTopDocument = {
  doc_id: string
  title: string
  year: number
  language_code: string
  topic: string
  hit_count: number
  quality_score: number
}

export type ConceptExcerpt = {
  doc_id: string
  title: string
  year: number
  language_code: string
  topic: string
  variant: string
  text: string
  start_char: number
  end_char: number
}

export type ConceptSummary = {
  id: string
  label: string
  description: string
  total_hits: number
  documents_with_hits: number
  by_decade: Record<string, number>
  by_language: Record<string, number>
  by_topic: Record<string, number>
  top_documents: ConceptTopDocument[]
  key_excerpts: ConceptExcerpt[]
  related_concepts: RelatedConcept[]
  variant_count: number
}

export type TermDocumentHit = {
  doc_id: string
  title: string
  year: number
  decade: string
  language_code: string
  topic: string
  char_count: number
  quality_score: number
  hit_count: number
  snippets: Array<{
    variant: string
    start_char: number
    end_char: number
    text: string
  }>
}

type TermsFile = {
  generated_at: string
  corpus_size: number
  concepts: ConceptSummary[]
}

type TermIndexFile = {
  generated_at: string
  corpus_size: number
  concepts: Record<
    string,
    {
      id: string
      label: string
      description: string
      documents: TermDocumentHit[]
    }
  >
}

const TERMS_FILE = path.join(process.cwd(), 'public', 'data', 'terms.json')
const TERM_INDEX_FILE = path.join(process.cwd(), 'public', 'data', 'term-index.json')

let termsCache: { mtimeMs: number; value: TermsFile } | null = null
let termIndexCache: { mtimeMs: number; value: TermIndexFile } | null = null

async function loadJsonWithCache<T>(filePath: string, cache: { mtimeMs: number; value: T } | null): Promise<{ mtimeMs: number; value: T } | null> {
  try {
    const stat = await fs.stat(filePath)
    if (cache && cache.mtimeMs === stat.mtimeMs) {
      return cache
    }

    const raw = await fs.readFile(filePath, 'utf-8')
    const value = JSON.parse(raw) as T
    return { mtimeMs: stat.mtimeMs, value }
  } catch {
    return null
  }
}

export async function getTermsData(): Promise<TermsFile> {
  const loaded = await loadJsonWithCache<TermsFile>(TERMS_FILE, termsCache)
  if (loaded) {
    termsCache = loaded
    return loaded.value
  }

  return {
    generated_at: '',
    corpus_size: 0,
    concepts: [],
  }
}

export async function getTermIndexData(): Promise<TermIndexFile> {
  const loaded = await loadJsonWithCache<TermIndexFile>(TERM_INDEX_FILE, termIndexCache)
  if (loaded) {
    termIndexCache = loaded
    return loaded.value
  }

  return {
    generated_at: '',
    corpus_size: 0,
    concepts: {},
  }
}

export async function getAllConcepts(): Promise<ConceptSummary[]> {
  const data = await getTermsData()
  return [...data.concepts].sort((a, b) => a.label.localeCompare(b.label))
}

export async function getConceptById(id: string): Promise<ConceptSummary | null> {
  const data = await getTermsData()
  return data.concepts.find((concept) => concept.id === id) || null
}

export async function getConceptDocuments(id: string): Promise<TermDocumentHit[]> {
  const data = await getTermIndexData()
  const concept = data.concepts[id]
  if (!concept) return []
  return concept.documents || []
}
