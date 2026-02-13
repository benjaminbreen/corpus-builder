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
  gibberish_pages?: number[]
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

// Map legacy or alternate topic keys to canonical topic keys
export const TOPIC_ALIASES: Record<string, string> = {
  calculating_machines: 'computing',
  thinking_machines: 'automata_artificial_beings',
  automata: 'automata_artificial_beings',
  computing: 'computing',
  cybernetics: 'cybernetics',
  automation: 'automation',
  intelligence: 'intelligence',
  learning: 'learning',
  mechanism: 'mechanism',
  statistics_probability: 'statistics_probability',
  // Obscure-topic aliases (from older harvesters)
  chess_automaton: 'automata_artificial_beings',
  artificial_beings_fiction: 'automata_artificial_beings',
  reactions_pamphlets: 'automata_artificial_beings',
  popular_wonders: 'mechanism',
  vitalism_debates: 'mechanism',
  machinery_labor: 'automation',
  universal_language: 'representation_symbol_systems',
}

// Topic display names
export const TOPIC_NAMES: Record<string, string> = {
  automata_artificial_beings: 'Automata & Artificial Beings',
  computing: 'Computation & Calculating Machines',
  logic_formal_reasoning: 'Logic & Formal Reasoning',
  intelligence: 'Intelligence, Reasoning & Agency',
  learning: 'Learning, Memory & Habit',
  mechanism: 'Mechanism & Machinery',
  statistics_probability: 'Statistics, Probability & Uncertainty',
  cybernetics: 'Systems, Cybernetics & Networks',
  automation: 'Automation & Work',
  representation_symbol_systems: 'Representation & Symbol Systems',
  // Legacy keys (display as canonical)
  calculating_machines: 'Computation & Calculating Machines',
  automata: 'Automata & Artificial Beings',
  thinking_machines: 'Automata & Artificial Beings',
}
