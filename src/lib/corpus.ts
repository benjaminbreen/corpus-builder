import { promises as fs } from 'fs'
import path from 'path'

// Re-export types and constants from the shared types file
export type { Document, CorpusStats } from './types'
export { LANGUAGE_NAMES, TOPIC_NAMES } from './types'

import type { Document, CorpusStats } from './types'

const CORPUS_INDEX_PATH = path.join(process.cwd(), 'public', 'data', 'corpus-index.json')

let cachedCorpus: Document[] | null = null

export async function getCorpus(): Promise<Document[]> {
  if (cachedCorpus) {
    return cachedCorpus
  }

  try {
    const data = await fs.readFile(CORPUS_INDEX_PATH, 'utf-8')
    cachedCorpus = JSON.parse(data)
    return cachedCorpus!
  } catch (error) {
    // Return empty array if corpus index doesn't exist yet
    console.warn('Corpus index not found, returning empty corpus')
    return []
  }
}

export async function getCorpusStats(): Promise<CorpusStats> {
  const corpus = await getCorpus()

  if (corpus.length === 0) {
    return {
      totalDocuments: 0,
      startYear: 1600,
      endYear: 2000,
      languages: ['English', 'French', 'German', 'Russian', 'Spanish', 'Italian'],
      topics: ['automata', 'computing', 'intelligence', 'mechanism'],
      decades: [1600, 1700, 1800, 1900],
      byCentury: { '17': 0, '18': 0, '19': 0, '20': 0 },
      byDecade: {},
      byTopic: {},
      byLanguage: {},
      recentDocuments: [],
    }
  }

  const years = corpus.map((d) => d.year).filter(Boolean)
  const startYear = Math.min(...years)
  const endYear = Math.max(...years)

  // Count by decade
  const byDecade: Record<string, number> = {}
  const byCentury: Record<string, number> = { '17': 0, '18': 0, '19': 0, '20': 0 }

  corpus.forEach((doc) => {
    const decade = Math.floor(doc.year / 10) * 10
    byDecade[decade] = (byDecade[decade] || 0) + 1

    const century = Math.floor(doc.year / 100).toString()
    if (byCentury[century] !== undefined) {
      byCentury[century]++
    }
  })

  // Count by topic
  const byTopic: Record<string, number> = {}
  corpus.forEach((doc) => {
    byTopic[doc.topic] = (byTopic[doc.topic] || 0) + 1
  })

  // Count by language
  const byLanguage: Record<string, number> = {}
  corpus.forEach((doc) => {
    const lang = doc.language_code || 'unknown'
    byLanguage[lang] = (byLanguage[lang] || 0) + 1
  })

  // Get unique values
  const decades = [...new Set(corpus.map((d) => Math.floor(d.year / 10) * 10))].sort()
  const topics = [...new Set(corpus.map((d) => d.topic))].sort()
  const languages = [...new Set(corpus.map((d) => d.language_code))].filter(Boolean).sort()

  // Get recent documents (by download date, or just last 10)
  const recentDocuments = [...corpus]
    .sort((a, b) => (b.downloaded_at || '').localeCompare(a.downloaded_at || ''))
    .slice(0, 10)

  return {
    totalDocuments: corpus.length,
    startYear,
    endYear,
    languages,
    topics,
    decades,
    byCentury,
    byDecade,
    byTopic,
    byLanguage,
    recentDocuments,
  }
}

export async function getDocument(identifier: string): Promise<Document | null> {
  const corpus = await getCorpus()
  return corpus.find((d) => d.identifier === identifier) || null
}

export async function getDocumentsByDecade(decade: number): Promise<Document[]> {
  const corpus = await getCorpus()
  return corpus
    .filter((d) => Math.floor(d.year / 10) * 10 === decade)
    .sort((a, b) => a.year - b.year)
}

export async function getDocumentsByTopic(topic: string): Promise<Document[]> {
  const corpus = await getCorpus()
  return corpus
    .filter((d) => d.topic === topic)
    .sort((a, b) => a.year - b.year)
}

export async function getDocumentsByLanguage(languageCode: string): Promise<Document[]> {
  const corpus = await getCorpus()
  return corpus
    .filter((d) => d.language_code === languageCode)
    .sort((a, b) => a.year - b.year)
}

export async function getAllDecades(): Promise<number[]> {
  const corpus = await getCorpus()
  const decades = [...new Set(corpus.map((d) => Math.floor(d.year / 10) * 10))]
  return decades.sort()
}

export async function getAllTopics(): Promise<string[]> {
  const corpus = await getCorpus()
  const topics = [...new Set(corpus.map((d) => d.topic))]
  return topics.sort()
}

export async function getAllLanguages(): Promise<string[]> {
  const corpus = await getCorpus()
  const languages = [...new Set(corpus.map((d) => d.language_code))]
  return languages.filter(Boolean).sort()
}

