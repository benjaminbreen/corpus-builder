'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Example {
  text: string
  year: number
  title: string
  doc_id: string
}

interface DriftData {
  decade: string
  similarity_to_origin: number
  similarity_to_previous?: number
  num_contexts: number
  examples: Example[]
}

interface TermData {
  variants: string[]
  total_contexts: number
  decades_covered: number
  drift: DriftData[]
}

interface SemanticDriftData {
  model: string
  terms: Record<string, TermData>
  timeline: string[]
}

const TERM_COLORS: Record<string, string> = {
  intelligence: '#8B5CF6', // purple
  automaton: '#F59E0B',    // amber
  engine: '#10B981',       // emerald
}

const TERM_DESCRIPTIONS: Record<string, string> = {
  intelligence: 'From "news/information" to "cognitive faculty"',
  automaton: 'Self-moving devices and artificial beings',
  engine: 'From "war machines" to "power generators"',
}

export default function SemanticDriftPage() {
  const [data, setData] = useState<SemanticDriftData | null>(null)
  const [selectedTerm, setSelectedTerm] = useState<string>('intelligence')
  const [selectedDecade, setSelectedDecade] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/data/semantic-drift.json')
      .then(res => res.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load semantic drift data:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="animate-fade-in">
        <section className="container-content pt-16 pb-8">
          <div className="text-center py-16">
            <div className="inline-block w-6 h-6 border-2 border-copper-400 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-ink-400">Loading semantic analysis...</p>
          </div>
        </section>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="animate-fade-in">
        <section className="container-content pt-16 pb-8">
          <p className="text-ink-500">No semantic drift data available.</p>
        </section>
      </div>
    )
  }

  const termData = data.terms[selectedTerm]
  const driftData = termData?.drift || []

  // Calculate chart dimensions
  const chartHeight = 200
  const chartWidth = 800
  const padding = { top: 20, right: 20, bottom: 40, left: 50 }

  // Get min/max values for scaling
  const similarities = driftData.map(d => d.similarity_to_origin)
  const minSim = Math.min(...similarities, 0.7)
  const maxSim = 1.0

  // Scale functions
  const xScale = (index: number) =>
    padding.left + (index / (driftData.length - 1)) * (chartWidth - padding.left - padding.right)
  const yScale = (value: number) =>
    padding.top + (1 - (value - minSim) / (maxSim - minSim)) * (chartHeight - padding.top - padding.bottom)

  // Generate path
  const pathD = driftData.map((d, i) => {
    const x = xScale(i)
    const y = yScale(d.similarity_to_origin)
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-8">
        <Link href="/" className="nav-link inline-flex items-center gap-1 mb-8">
          ← Back to Archive
        </Link>

        <h1 className="text-2xl md:text-3xl mb-4">Semantic Drift Analysis</h1>
        <p className="text-ink-600 max-w-2xl mb-8">
          Tracking how key terms change meaning across four centuries of texts about
          machines, minds, and intelligence. Using embedding models to measure semantic
          similarity across time periods.
        </p>

        <div className="bg-paper-100 border border-paper-200 rounded-sm p-4 mb-8">
          <div className="text-xs text-ink-500 mb-2">Model: {data.model}</div>
          <div className="flex flex-wrap gap-2">
            {Object.keys(data.terms).map(term => (
              <button
                key={term}
                onClick={() => {
                  setSelectedTerm(term)
                  setSelectedDecade(null)
                }}
                className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
                  selectedTerm === term
                    ? 'text-white'
                    : 'bg-paper-200 text-ink-600 hover:bg-paper-300'
                }`}
                style={{
                  backgroundColor: selectedTerm === term ? TERM_COLORS[term] : undefined,
                }}
              >
                {term}
                <span className="ml-2 opacity-70">
                  ({data.terms[term].total_contexts.toLocaleString()})
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="rule" />

      <section className="container-content py-8">
        {termData && (
          <div className="grid lg:grid-cols-[1fr_300px] gap-8">
            <div>
              {/* Chart */}
              <div className="bg-paper-50 border border-paper-200 rounded-sm p-6 mb-6">
                <h3 className="text-lg mb-2">Semantic Similarity to Origin ({driftData[0]?.decade})</h3>
                <p className="text-sm text-ink-500 mb-4">
                  {TERM_DESCRIPTIONS[selectedTerm]}
                </p>

                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-auto"
                  style={{ maxHeight: 250 }}
                >
                  {/* Grid lines */}
                  {[0.7, 0.8, 0.9, 1.0].map(v => (
                    <g key={v}>
                      <line
                        x1={padding.left}
                        y1={yScale(v)}
                        x2={chartWidth - padding.right}
                        y2={yScale(v)}
                        stroke="#e5e5e5"
                        strokeDasharray="4,4"
                      />
                      <text
                        x={padding.left - 10}
                        y={yScale(v)}
                        textAnchor="end"
                        alignmentBaseline="middle"
                        className="text-xs fill-ink-400"
                      >
                        {v.toFixed(1)}
                      </text>
                    </g>
                  ))}

                  {/* Path */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={TERM_COLORS[selectedTerm]}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Data points */}
                  {driftData.map((d, i) => (
                    <g key={d.decade}>
                      <circle
                        cx={xScale(i)}
                        cy={yScale(d.similarity_to_origin)}
                        r={selectedDecade === d.decade ? 8 : 5}
                        fill={TERM_COLORS[selectedTerm]}
                        className="cursor-pointer transition-all"
                        onClick={() => setSelectedDecade(d.decade)}
                      />
                      {/* Decade labels */}
                      {i % 3 === 0 && (
                        <text
                          x={xScale(i)}
                          y={chartHeight - 10}
                          textAnchor="middle"
                          className="text-xs fill-ink-500"
                        >
                          {d.decade}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>

                <div className="mt-4 text-xs text-ink-500">
                  Click on data points to see example sentences from that decade.
                </div>
              </div>

              {/* Example sentences */}
              {selectedDecade && (
                <div className="bg-paper-50 border border-paper-200 rounded-sm p-6">
                  <h3 className="text-lg mb-4">
                    Examples from the {selectedDecade}
                    <span className="ml-2 text-sm font-normal text-ink-500">
                      ({driftData.find(d => d.decade === selectedDecade)?.num_contexts.toLocaleString()} total occurrences)
                    </span>
                  </h3>

                  <div className="space-y-4">
                    {driftData
                      .find(d => d.decade === selectedDecade)
                      ?.examples.map((ex, i) => (
                        <blockquote key={i} className="border-l-2 border-copper-300 pl-4">
                          <p className="font-serif text-sm text-ink-700 leading-relaxed mb-2">
                            &ldquo;{ex.text}&rdquo;
                          </p>
                          <div className="flex items-center gap-2 text-xs text-ink-500">
                            <span className="font-mono">{ex.year}</span>
                            <span className="text-ink-300">·</span>
                            <Link
                              href={`/document/${ex.doc_id}`}
                              className="text-copper-600 hover:text-copper-700"
                            >
                              {ex.title}...
                            </Link>
                          </div>
                        </blockquote>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar stats */}
            <aside className="space-y-4">
              <div className="bg-paper-100 border border-paper-200 rounded-sm p-5">
                <h4 className="meta-label mb-3">Term Variants</h4>
                <div className="flex flex-wrap gap-1">
                  {termData.variants.map(v => (
                    <span key={v} className="tag text-xs">{v}</span>
                  ))}
                </div>
              </div>

              <div className="bg-paper-100 border border-paper-200 rounded-sm p-5">
                <h4 className="meta-label mb-3">Coverage</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-500">Total contexts</span>
                    <span className="font-mono">{termData.total_contexts.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-500">Decades</span>
                    <span className="font-mono">{termData.decades_covered}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-500">First appearance</span>
                    <span className="font-mono">{driftData[0]?.decade}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-500">Last appearance</span>
                    <span className="font-mono">{driftData[driftData.length - 1]?.decade}</span>
                  </div>
                </div>
              </div>

              <div className="bg-copper-50 border border-copper-200 rounded-sm p-5">
                <h4 className="meta-label text-copper-700 mb-3">How to Read This</h4>
                <p className="text-xs text-copper-800 leading-relaxed">
                  The chart shows how similar the term&apos;s usage is to its earliest
                  recorded meaning (1.0 = identical). Lower values indicate the term
                  has shifted to new contexts or meanings over time.
                </p>
              </div>
            </aside>
          </div>
        )}
      </section>

      <div className="rule" />

      <section className="container-content py-8">
        <h2 className="text-xl mb-4">Methodology</h2>
        <div className="prose prose-sm max-w-2xl text-ink-600">
          <p>
            This analysis uses <strong>sentence embeddings</strong> to track semantic change.
            For each target term, we:
          </p>
          <ol className="list-decimal list-inside space-y-1 mt-2">
            <li>Extract all sentences containing the term (and its multilingual variants)</li>
            <li>Group sentences by decade of publication</li>
            <li>Compute embeddings using a multilingual transformer model</li>
            <li>Calculate the <em>centroid</em> (average) embedding for each decade</li>
            <li>Measure cosine similarity between each decade and the earliest occurrence</li>
          </ol>
          <p className="mt-4">
            A similarity of 1.0 means the term is used in identical contexts; lower values
            indicate semantic drift—the term appearing in new kinds of sentences with
            different surrounding words.
          </p>
        </div>
      </section>
    </div>
  )
}
