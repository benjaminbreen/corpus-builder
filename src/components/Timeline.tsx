'use client'

import { useMemo } from 'react'
import Link from 'next/link'

interface TimelineProps {
  data: Record<string | number, number> // decade -> count (keys may be strings from JSON)
  startYear?: number
  endYear?: number
}

export function Timeline({ data, startYear = 1600, endYear = 2000 }: TimelineProps) {
  const decades = useMemo(() => {
    const result = []
    for (let decade = startYear; decade <= endYear; decade += 10) {
      // Check both string and number keys since JSON parsing creates string keys
      result.push({
        decade,
        count: data[decade] || data[String(decade)] || 0,
      })
    }
    return result
  }, [data, startYear, endYear])

  const maxCount = Math.max(...Object.values(data), 1)

  // Group by century for labels
  const centuries = [
    { label: '1600s', start: 1600 },
    { label: '1700s', start: 1700 },
    { label: '1800s', start: 1800 },
    { label: '1900s', start: 1900 },
  ]

  return (
    <div className="w-full">
      {/* Timeline bars */}
      <div className="relative">
        {/* Background grid lines */}
        <div className="absolute inset-0 flex">
          {centuries.map((c, i) => (
            <div
              key={c.label}
              className={`flex-1 ${i < centuries.length - 1 ? 'border-r border-paper-200' : ''}`}
            />
          ))}
        </div>

        {/* Bars */}
        <div className="relative flex items-end h-32 gap-px">
          {decades.map(({ decade, count }) => {
            const height = count > 0 ? Math.max((count / maxCount) * 100, 8) : 0
            const hasDocuments = count > 0

            return (
              <Link
                key={decade}
                href={hasDocuments ? `/decade/${decade}` : '#'}
                className={`
                  flex-1 h-full relative group transition-all duration-150
                  ${hasDocuments ? 'cursor-pointer' : 'cursor-default'}
                `}
                title={hasDocuments ? `${decade}s: ${count} documents` : `${decade}s: No documents`}
              >
                {/* Bar */}
                <div
                  className={`
                    absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[20px] rounded-t-sm
                    transition-all duration-150
                    ${hasDocuments
                      ? 'bg-copper-400 group-hover:bg-copper-500'
                      : 'bg-paper-200'
                    }
                  `}
                  style={{ height: `${height}%` }}
                />

                {/* Tooltip */}
                {hasDocuments && (
                  <div className="
                    absolute -top-10 left-1/2 -translate-x-1/2
                    px-2 py-1 bg-ink-900 text-paper-50 text-xs font-mono rounded
                    opacity-0 group-hover:opacity-100 transition-opacity
                    whitespace-nowrap pointer-events-none z-10
                  ">
                    {decade}s: {count}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Century labels */}
      <div className="flex mt-3 border-t border-paper-200 pt-2">
        {centuries.map((c) => (
          <div key={c.label} className="flex-1 text-center">
            <span className="font-mono text-xs text-ink-400">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Compact timeline for sidebar/cards
 */
export function TimelineMini({ data, startYear = 1600, endYear = 2000 }: TimelineProps) {
  const decades = useMemo(() => {
    const result = []
    for (let decade = startYear; decade <= endYear; decade += 10) {
      result.push({
        decade,
        count: data[decade] || data[String(decade)] || 0,
      })
    }
    return result
  }, [data, startYear, endYear])

  const maxCount = Math.max(...Object.values(data), 1)

  return (
    <div className="flex items-end h-8 gap-px">
      {decades.map(({ decade, count }) => {
        const height = count > 0 ? Math.max((count / maxCount) * 100, 15) : 0
        return (
          <div
            key={decade}
            className={`
              flex-1 rounded-t-sm transition-colors
              ${count > 0 ? 'bg-copper-300' : 'bg-paper-200'}
            `}
            style={{ height: `${height}%` }}
            title={`${decade}s: ${count}`}
          />
        )
      })}
    </div>
  )
}
