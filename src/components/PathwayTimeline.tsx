import Link from 'next/link'
import Image from 'next/image'
import type { Document } from '@/lib/types'

export interface PathwayStop {
  id: string
  note: string
  /** Wikipedia article title for thumbnail lookup (e.g. "René_Descartes") */
  wikipedia?: string
}

export interface ResolvedStop {
  stop: PathwayStop
  doc: Document | null
  thumbnailUrl?: string | null
}

interface PathwayTimelineProps {
  stops: ResolvedStop[]
}

export function PathwayTimeline({ stops }: PathwayTimelineProps) {
  return (
    <div className="relative ml-4 md:ml-8">
      {/* Vertical line */}
      <div className="absolute left-0 top-0 bottom-0 w-px bg-paper-300" />

      {stops.map(({ stop, doc, thumbnailUrl }, index) => {
        const prevYear = index > 0 ? stops[index - 1].doc?.year : null
        const currentYear = doc?.year
        const yearGap = prevYear && currentYear ? currentYear - prevYear : null

        return (
          <div key={stop.id}>
            {/* Time gap indicator */}
            {yearGap !== null && yearGap > 0 && (
              <div className="relative flex items-center py-3 pl-6">
                <span className="font-mono text-xs text-ink-400 italic">
                  ~ {yearGap} {yearGap === 1 ? 'year' : 'years'} ~
                </span>
              </div>
            )}

            {/* Node + Card */}
            <div className="relative flex items-stretch">
              {/* Node dot */}
              <div className="absolute left-0 top-6 -translate-x-1/2 z-10">
                <div className="w-3 h-3 rounded-full bg-copper-500 border-2 border-paper-50 shadow-sm" />
              </div>

              {/* Horizontal connector */}
              <div className="absolute left-0 top-[1.65rem] w-5 h-px bg-paper-300" />

              {/* Card */}
              <article className="ml-7 mb-4 flex-1 p-5 border border-paper-200 rounded-sm bg-paper-50 hover:border-copper-400 transition-colors">
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  {thumbnailUrl && (
                    <div className="hidden sm:block flex-shrink-0">
                      <div className="w-16 h-16 md:w-20 md:h-20 rounded-sm overflow-hidden border border-paper-200 bg-paper-100">
                        <Image
                          src={thumbnailUrl}
                          alt=""
                          width={80}
                          height={80}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      </div>
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500 mb-2">
                      {doc?.year && <span className="font-mono text-copper-700 font-medium">{doc.year}</span>}
                      <span className="text-ink-300">·</span>
                      <span>Stop {index + 1}</span>
                      {doc?.language_code && (
                        <>
                          <span className="text-ink-300">·</span>
                          <span className="tag">{doc.language_code}</span>
                        </>
                      )}
                      {doc?.topic && (
                        <>
                          <span className="text-ink-300">·</span>
                          <span className="tag">{doc.topic}</span>
                        </>
                      )}
                    </div>
                    <h2 className="text-lg font-serif mb-2">{doc?.title || stop.id}</h2>
                    <p className="text-sm text-ink-700 leading-relaxed mb-3">{stop.note}</p>
                    <div className="flex flex-wrap gap-3">
                      {doc ? (
                        <Link href={`/document/${doc.identifier}`} className="btn-secondary text-sm">
                          Open Source
                        </Link>
                      ) : (
                        <span className="text-sm text-red-700">Document not currently in indexed corpus.</span>
                      )}
                      <Link href="/search" className="nav-link text-sm">
                        Search related terms →
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        )
      })}

      {/* End node */}
      <div className="relative flex items-center pl-7 pt-2 pb-4">
        <div className="absolute left-0 top-3 -translate-x-1/2 z-10">
          <div className="w-3.5 h-3.5 rounded-full bg-paper-50 border-2 border-copper-500 shadow-sm" />
        </div>
        <span className="font-mono text-xs text-ink-400">
          End · {stops.length} sources
          {stops[0]?.doc?.year && stops[stops.length - 1]?.doc?.year && (
            <> spanning {stops[stops.length - 1].doc!.year - stops[0].doc!.year}+ years</>
          )}
        </span>
      </div>
    </div>
  )
}
