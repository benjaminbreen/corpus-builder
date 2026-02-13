import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const MODEL_NAME = 'gemini-2.5-flash-lite'
const MAX_INPUT_CHARS = 45_000
const MAX_OUTPUT_TOKENS = 8_192

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 18
const requestLog = new Map<string, number[]>()

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'local'
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entries = requestLog.get(ip) || []
  const fresh = entries.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS)

  if (fresh.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, fresh)
    return true
  }

  fresh.push(now)
  requestLog.set(ip, fresh)

  if (requestLog.size > 1000) {
    requestLog.forEach((values, key) => {
      const retained = values.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS)
      if (retained.length === 0) {
        requestLog.delete(key)
      } else {
        requestLog.set(key, retained)
      }
    })
  }

  return false
}

type TranslateBody = {
  text?: string
  sourceLanguage?: string
  targetLanguage?: string
}

function buildPrompt(text: string, sourceLanguage: string, targetLanguage: string): string {
  return [
    `Translate the following text from ${sourceLanguage || 'its original language'} to ${targetLanguage}.`,
    'Rules:',
    '- Return only the translated text.',
    '- Preserve paragraph breaks and structure.',
    '- Do not summarize, explain, or add notes.',
    '- If a phrase is unclear because of OCR noise, provide the closest faithful rendering.',
    '',
    'Text:',
    text,
  ].join('\n')
}

function extractResponseText(payload: any): string {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : []
  const parts = candidates[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Too many translation requests. Retry in a minute.' }, { status: 429 })
    }

    let body: TranslateBody
    try {
      body = (await req.json()) as TranslateBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    const rawText = String(body.text || '').trim()
    if (!rawText) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }
    if (rawText.length > MAX_INPUT_CHARS) {
      return NextResponse.json({ error: `Text too long (max ${MAX_INPUT_CHARS} chars)` }, { status: 400 })
    }

    const sourceLanguage = String(body.sourceLanguage || '').trim() || 'original language'
    const targetLanguage = String(body.targetLanguage || '').trim() || 'English'

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 500 })
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${encodeURIComponent(apiKey)}`
    const prompt = buildPrompt(rawText, sourceLanguage, targetLanguage)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.15,
          topP: 0.95,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.error?.status ||
        `Gemini request failed (${response.status})`
      return NextResponse.json({ error: message }, { status: 502 })
    }

    const translation = extractResponseText(payload)
    if (!translation) {
      return NextResponse.json({ error: 'No translation text returned by Gemini.' }, { status: 502 })
    }

    return NextResponse.json({
      model: MODEL_NAME,
      translation,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Translation failed' },
      { status: 500 },
    )
  }
}
