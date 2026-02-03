/**
 * Shared types and constants for the GEMI corpus interface.
 * This file contains only types and constants - no Node.js dependencies.
 * Safe to import from both client and server components.
 */

export interface Document {
  identifier: string
  title: string
  year: number
  publication_year?: number
  gutenberg_release_year?: number
  year_source?: string
  date?: string
  creator?: string
  description?: string | string[]
  summary?: string  // Human-readable summary of the document
  subject?: string | string[]
  topic: string
  search_term?: string
  language_code: string
  language?: string
  source_url: string
  text_url?: string
  char_count: number
  downloaded_at?: string
  local_path?: string
  storage_url?: string
  filename?: string
  source?: string
  // Translation support
  has_translation?: boolean
  translation_filename?: string
}

export interface CorpusStats {
  totalDocuments: number
  startYear: number
  endYear: number
  languages: string[]
  topics: string[]
  decades: number[]
  byCentury: Record<string, number>
  byDecade: Record<string, number>
  byTopic: Record<string, number>
  byLanguage: Record<string, number>
  recentDocuments: Document[]
}

export interface Quote {
  id: string
  doc_id: string
  text: string
  tags: string[]
  year: number
  language_code: string
  topic: string
  page?: string
  source_title?: string
}

// Language code to full name mapping
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  de: 'German',
  ru: 'Russian',
  es: 'Spanish',
  it: 'Italian',
  la: 'Latin',
}

// Topic display names
export const TOPIC_NAMES: Record<string, string> = {
  calculating_machines: 'Calculating Machines',
  automata: 'Automata',
  thinking_machines: 'Thinking Machines',
  computing: 'Computing',
  cybernetics: 'Cybernetics',
  automation: 'Automation',
  intelligence: 'Intelligence',
  learning: 'Learning',
  mechanism: 'Mechanism',
  statistics_probability: 'Statistics & Probability',
}
