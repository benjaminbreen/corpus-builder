import { getCorpus } from '@/lib/corpus'

export const dynamic = 'force-static'

const COLUMNS = ['identifier', 'title', 'creator', 'year', 'language', 'topic', 'source', 'source_url', 'char_count', 'description'] as const

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join('; ') : value == null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function GET() {
  const corpus = await getCorpus()
  const rows = [...corpus]
    .sort((a, b) => a.year - b.year)
    .map((doc) => COLUMNS.map((col) => csvCell((doc as unknown as Record<string, unknown>)[col]?.toString().trim())).join(','))
  const body = [COLUMNS.join(','), ...rows].join('\n') + '\n'
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="gemi-catalog.csv"',
    },
  })
}
