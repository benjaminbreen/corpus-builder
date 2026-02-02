'use client'

import { useState, useEffect } from 'react'

interface TextViewerProps {
  filename: string | null
  supabaseUrl: string
  bucketName?: string
  hasTranslation?: boolean
  translationFilename?: string
  originalLanguage?: string
}

export function TextViewer({
  filename,
  supabaseUrl,
  bucketName = 'corpus-texts',
  hasTranslation = false,
  translationFilename,
  originalLanguage,
}: TextViewerProps) {
  const [text, setText] = useState<string | null>(null)
  const [translatedText, setTranslatedText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingTranslation, setLoadingTranslation] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base')
  const [showTranslation, setShowTranslation] = useState(false)

  // Fetch original text
  useEffect(() => {
    async function fetchText() {
      if (!filename) {
        setError('No text file available')
        setLoading(false)
        return
      }

      try {
        let response: Response | null = null

        // Prefer local raw text in dev/exported builds
        response = await fetch(`/raw_texts/${filename}`)

        if (!response.ok && supabaseUrl) {
          const url = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filename}`
          response = await fetch(url)
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch text: ${response.status}`)
        }

        const content = await response.text()
        setText(content)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load text')
      } finally {
        setLoading(false)
      }
    }

    fetchText()
  }, [filename, supabaseUrl, bucketName])

  // Fetch translation when toggled
  useEffect(() => {
    async function fetchTranslation() {
      if (!showTranslation || !translationFilename || translatedText) return

      setLoadingTranslation(true)
      try {
        // Try local file first (for development)
        let response = await fetch(`/translations/${translationFilename}`)

        // If local fails, try Supabase
        if (!response.ok) {
          const url = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${translationFilename}`
          response = await fetch(url)
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch translation: ${response.status}`)
        }

        const content = await response.text()
        setTranslatedText(content)
      } catch (err) {
        console.error('Failed to load translation:', err)
        // Fall back to showing original
        setShowTranslation(false)
      } finally {
        setLoadingTranslation(false)
      }
    }

    fetchTranslation()
  }, [showTranslation, translationFilename, translatedText, supabaseUrl, bucketName])

  const fontSizeClasses = {
    sm: 'text-xs leading-relaxed',
    base: 'text-sm leading-relaxed',
    lg: 'text-base leading-loose',
  }

  const displayText = showTranslation && translatedText ? translatedText : text

  if (loading) {
    return (
      <div className="bg-paper-50 border border-paper-200 rounded-sm p-6 md:p-8">
        <div className="text-center py-16">
          <div className="inline-block w-6 h-6 border-2 border-copper-400 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-ink-400">Loading document text...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-paper-50 border border-paper-200 rounded-sm p-6 md:p-8">
        <div className="text-center py-16 text-ink-400">
          <p className="text-lg mb-2">Unable to load text</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-paper-50 border border-paper-200 rounded-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-paper-200 bg-paper-100">
        <div className="flex items-center gap-3">
          {/* Translation toggle */}
          {hasTranslation && (
            <button
              onClick={() => setShowTranslation(!showTranslation)}
              disabled={loadingTranslation}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-sm border transition-colors ${
                showTranslation
                  ? 'bg-copper-600 text-paper-50 border-copper-600'
                  : 'bg-paper-50 text-ink-600 border-paper-300 hover:border-copper-400'
              }`}
            >
              {loadingTranslation ? (
                <>
                  <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  Loading...
                </>
              ) : showTranslation ? (
                <>
                  <span>EN</span>
                  <span className="text-copper-200">|</span>
                  <span className="opacity-60">{originalLanguage?.toUpperCase() || 'ORIG'}</span>
                </>
              ) : (
                <>
                  <span className="opacity-60">EN</span>
                  <span className="text-ink-300">|</span>
                  <span>{originalLanguage?.toUpperCase() || 'ORIG'}</span>
                </>
              )}
            </button>
          )}

          <span className="font-mono text-xs text-ink-400">
            {displayText ? `${displayText.length.toLocaleString()} characters` : ''}
            {showTranslation && ' (translation)'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-sans text-xs text-ink-500 mr-1">Size:</span>
          {(['sm', 'base', 'lg'] as const).map((size) => (
            <button
              key={size}
              onClick={() => setFontSize(size)}
              className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                fontSize === size
                  ? 'bg-copper-600 text-paper-50'
                  : 'bg-paper-200 text-ink-600 hover:bg-paper-300'
              }`}
            >
              {size === 'sm' ? 'S' : size === 'base' ? 'M' : 'L'}
            </button>
          ))}
        </div>
      </div>

      {/* Translation notice */}
      {showTranslation && translatedText && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs">
          <strong>LLM-generated translation</strong> — This translation was created by an AI language model.
          It may contain errors. Toggle above to view the original text.
        </div>
      )}

      {/* Text content */}
      <div className="p-6 md:p-8 max-h-[70vh] overflow-y-auto">
        <pre
          className={`font-serif whitespace-pre-wrap break-words ${fontSizeClasses[fontSize]}`}
          style={{ tabSize: 4 }}
        >
          {displayText}
        </pre>
      </div>
    </div>
  )
}
