const HTML_ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeHtmlEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/giu, (full, token) => {
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

export function looksLikeOcrMarkup(text) {
  const sample = String(text || '').slice(0, 12000)
  if (!sample) return false

  if (/<meta[^>]+ocr-capabilities/iu.test(sample)) return true
  if (/class=["']ocr_(?:page|carea|par|line)|class=["']ocrx_word/iu.test(sample)) return true

  let markerCount = 0
  if (/<\?xml[\s>]/iu.test(sample)) markerCount += 1
  if (/<!doctype\s+html/iu.test(sample)) markerCount += 1
  if (/<html[\s>]/iu.test(sample)) markerCount += 1
  if (/<body[\s>]/iu.test(sample)) markerCount += 1

  return markerCount >= 2
}

function stripHtmlToText(markup) {
  return markup
    .replace(/<\?xml[\s\S]*?\?>/giu, ' ')
    .replace(/<!doctype[\s\S]*?>/giu, ' ')
    .replace(/<head[\s\S]*?<\/head>/giu, ' ')
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function reflowTokenizedLines(text) {
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

export function normalizeOcrText(rawText) {
  const input = String(rawText || '')
  if (!input) return ''
  if (!looksLikeOcrMarkup(input)) return input

  const stripped = stripHtmlToText(input)
  const decoded = decodeHtmlEntities(stripped)
  return reflowTokenizedLines(normalizeWhitespace(decoded))
}
