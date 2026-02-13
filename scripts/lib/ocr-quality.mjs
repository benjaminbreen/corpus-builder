const TOKEN_REGEX = /\S+/gu
const LETTER_TOKEN_REGEX = /\p{L}{3,}/gu
const WEIRD_CHAR_REGEX = /[\$\^\*\{\}\[\]\|~`<>]/gu

function countMatches(text, regex) {
  const matches = text.match(regex)
  return matches ? matches.length : 0
}

export function analyzeOcrQuality(text) {
  const normalized = String(text || '')
  const chars = normalized.length
  const tokens = countMatches(normalized, TOKEN_REGEX)
  const letterTokens = countMatches(normalized, LETTER_TOKEN_REGEX)
  const weirdChars = countMatches(normalized, WEIRD_CHAR_REGEX)

  const lines = normalized.split(/\r?\n/)
  let consideredLines = 0
  let noisyLines = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length < 20) continue

    consideredLines += 1

    const letters = countMatches(trimmed, /\p{L}/gu)
    const symbolsOrDigits = countMatches(trimmed, /[^\p{L}\s]/gu)

    if (letters < 6 && symbolsOrDigits > 8) {
      noisyLines += 1
    }
  }

  const alphaRatio = tokens > 0 ? letterTokens / tokens : 0
  const weirdDensity = chars > 0 ? weirdChars / chars : 0
  const noiseLineRatio = consideredLines > 0 ? noisyLines / consideredLines : 0

  // Heuristic score tuned for OCR-heavy historical scans.
  const score = alphaRatio - weirdDensity * 8 - noiseLineRatio * 0.7

  return {
    chars,
    tokens,
    letterTokens,
    alphaRatio,
    weirdChars,
    weirdDensity,
    noiseLineRatio,
    score,
  }
}

export function isNoisyOcr(metrics) {
  if (!metrics || metrics.chars < 500) {
    return true
  }

  // Very low lexical signal is almost always unusable OCR.
  if (metrics.alphaRatio < 0.5) {
    return true
  }

  // Short stubs with weak lexical signal are usually OCR fragments.
  if (metrics.chars < 3000 && metrics.alphaRatio < 0.62) {
    return true
  }

  // Longer files: require both weak lexical signal and high symbol noise.
  if (metrics.alphaRatio < 0.58 && metrics.weirdDensity > 0.008) {
    return true
  }

  return false
}
