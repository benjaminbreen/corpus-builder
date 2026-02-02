import Link from 'next/link'
import { getCorpusStats } from '@/lib/corpus'
import { Timeline } from '@/components/Timeline'

export const metadata = {
  title: 'Browse by Decade | GEMI',
  description: 'Explore the GEMI corpus organized by decade, from the 1600s to the 2000s.',
}

export default async function DecadesPage() {
  const stats = await getCorpusStats()

  // Group decades by century
  const centuries = [
    { label: '17th Century', range: '1600–1699', start: 1600, end: 1690 },
    { label: '18th Century', range: '1700–1799', start: 1700, end: 1790 },
    { label: '19th Century', range: '1800–1899', start: 1800, end: 1890 },
    { label: '20th Century', range: '1900–2000', start: 1900, end: 2000 },
  ]

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-12">
        <Link href="/" className="nav-link inline-flex items-center gap-1 mb-8">
          ← Back to Home
        </Link>

        <h1 className="mb-4">Browse by Decade</h1>
        <p className="text-lg text-ink-600 max-w-2xl">
          Explore {stats.totalDocuments} documents across 400 years of intellectual history,
          from early modern mechanical philosophy to the birth of artificial intelligence.
        </p>
      </section>

      {/* Full timeline */}
      <section className="container-content pb-12">
        <div className="max-w-4xl mx-auto">
          <div className="meta-label mb-3">Document Distribution (1600–2000)</div>
          <Timeline data={stats.byDecade} />
        </div>
      </section>

      <div className="rule" />

      <section className="container-content py-12">
        {centuries.map((century) => {
          const decadesInCentury = stats.decades.filter(
            (d) => d >= century.start && d <= century.end
          )
          const centuryCount = decadesInCentury.reduce(
            (sum, d) => sum + (stats.byDecade[d] || 0),
            0
          )

          return (
            <div key={century.label} className="mb-16 last:mb-0">
              <div className="flex items-baseline justify-between mb-6">
                <div>
                  <h2 className="text-2xl">{century.label}</h2>
                  <p className="font-mono text-sm text-ink-400 mt-1">{century.range}</p>
                </div>
                <span className="font-mono text-sm text-copper-700">
                  {centuryCount} {centuryCount === 1 ? 'document' : 'documents'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-3">
                {Array.from({ length: 10 }, (_, i) => {
                  const decade = century.start + i * 10
                  const count = stats.byDecade[decade] || 0
                  const hasDocuments = count > 0

                  return (
                    <Link
                      key={decade}
                      href={hasDocuments ? `/decade/${decade}` : '#'}
                      className={`
                        block p-3 rounded-sm border text-center transition-all
                        ${hasDocuments
                          ? 'bg-paper-50 border-paper-200 hover:border-copper-400 hover:bg-paper-100 cursor-pointer'
                          : 'bg-paper-100 border-paper-200 opacity-50 cursor-not-allowed'
                        }
                      `}
                    >
                      <div className={`font-mono text-sm ${hasDocuments ? 'text-ink-900' : 'text-ink-400'}`}>
                        {decade}s
                      </div>
                      <div className={`text-xs mt-1 ${hasDocuments ? 'text-copper-700' : 'text-ink-400'}`}>
                        {count > 0 ? count : '—'}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </section>

      {/* Summary */}
      <div className="rule" />

      <section className="container-content py-12">
        <div className="grid md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="font-mono text-3xl text-ink-900 mb-2">
              {stats.decades.length}
            </div>
            <div className="meta-label">Decades with Documents</div>
          </div>
          <div>
            <div className="font-mono text-3xl text-ink-900 mb-2">
              {stats.startYear}–{stats.endYear}
            </div>
            <div className="meta-label">Date Range</div>
          </div>
          <div>
            <div className="font-mono text-3xl text-ink-900 mb-2">
              {Math.round(stats.totalDocuments / stats.decades.length * 10) / 10}
            </div>
            <div className="meta-label">Avg. Documents per Decade</div>
          </div>
        </div>
      </section>
    </div>
  )
}
