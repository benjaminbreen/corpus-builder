const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (full, token) => {
    const normalized = String(token).toLowerCase()

    if (normalized.startsWith('#x')) {
      const code = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : full
    }

    if (normalized.startsWith('#')) {
      const code = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : full
    }

    return HTML_ENTITY_MAP[normalized] || full
  })
}

export function looksLikeOcrMarkup(text: string): boolean {
  const sample = String(text || '').slice(0, 12000)
  if (!sample) return false

  if (/<meta[^>]+ocr-capabilities/i.test(sample)) return true
  if (/class=["']ocr_(?:page|carea|par|line)|class=["']ocrx_word/i.test(sample)) return true

  let markerCount = 0
  if (/<\?xml[\s>]/i.test(sample)) markerCount += 1
  if (/<!doctype\s+html/i.test(sample)) markerCount += 1
  if (/<html[\s>]/i.test(sample)) markerCount += 1
  if (/<body[\s>]/i.test(sample)) markerCount += 1

  return markerCount >= 2
}

function stripHtmlToText(markup: string): string {
  return markup
    .replace(/<\?xml[\s\S]*?\?>/gi, ' ')
    .replace(/<!doctype[\s\S]*?>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function reflowTokenizedLines(text: string): string {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 80) {
    return text
  }

  const shortLineCount = lines.filter((line) => line.length <= 24).length
  const shortLineRatio = shortLineCount / lines.length

  if (shortLineRatio < 0.7) {
    return text
  }

  return lines.join(' ').replace(/\s+/g, ' ').trim()
}

export function normalizeOcrText(rawText: string): string {
  const input = String(rawText || '')
  if (!input) return ''
  if (!looksLikeOcrMarkup(input)) return input

  const stripped = stripHtmlToText(input)
  const decoded = decodeHtmlEntities(stripped)
  return reflowTokenizedLines(normalizeWhitespace(decoded))
}
