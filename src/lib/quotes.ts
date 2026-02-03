import { promises as fs } from 'fs'
import path from 'path'

import type { Quote } from './types'

const QUOTES_PATH = path.join(process.cwd(), 'public', 'data', 'quotes.json')

let cachedQuotes: Quote[] | null = null
let cachedQuotesMtimeMs: number | null = null

export async function getQuotes(): Promise<Quote[]> {
  try {
    const stat = await fs.stat(QUOTES_PATH)
    if (cachedQuotes && cachedQuotesMtimeMs === stat.mtimeMs) {
      return cachedQuotes
    }

    const data = await fs.readFile(QUOTES_PATH, 'utf-8')
    const parsed: Quote[] = JSON.parse(data)
    cachedQuotes = parsed
    cachedQuotesMtimeMs = stat.mtimeMs
    return parsed
  } catch (error) {
    console.warn('Quotes index not found, returning empty list')
    return []
  }
}

export async function getQuotesByDocument(docId: string): Promise<Quote[]> {
  const quotes = await getQuotes()
  return quotes.filter((q) => q.doc_id === docId)
}
