'use client'

import { useState, useEffect } from 'react'

interface TextViewerProps {
  filename: string | null
  supabaseUrl: string
  bucketName?: string
}

export function TextViewer({
  filename,
  supabaseUrl,
  bucketName = 'corpus-texts',
}: TextViewerProps) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base')

  useEffect(() => {
    async function fetchText() {
      if (!filename) {
        setError('No text file available')
        setLoading(false)
        return
      }

      try {
        const url = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filename}`
        const response = await fetch(url)

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

  const fontSizeClasses = {
    sm: 'text-xs leading-relaxed',
    base: 'text-sm leading-relaxed',
    lg: 'text-base leading-loose',
  }

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
      <div className="flex items-center justify-between px-4 py-2 border-b border-paper-200 bg-paper-100">
        <span className="font-mono text-xs text-ink-400">
          {text ? `${text.length.toLocaleString()} characters` : ''}
        </span>
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

      {/* Text content */}
      <div className="p-6 md:p-8 max-h-[70vh] overflow-y-auto">
        <pre
          className={`font-serif whitespace-pre-wrap break-words ${fontSizeClasses[fontSize]}`}
          style={{ tabSize: 4 }}
        >
          {text}
        </pre>
      </div>
    </div>
  )
}
