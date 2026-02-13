import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAllConcepts, getConceptById, getConceptDocuments } from '@/lib/terms'
import { findTextHits, renderTextWithHighlights } from '@/lib/highlight'

interface PageProps {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-static'

export async function generateStaticParams() {
  const concepts = await getAllConcepts()
  return concepts.map((concept) => ({ id: concept.id }))
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const concept = await getConceptById(id)
  if (!concept) {
    return { title: 'Concept Not Found | GEMI' }
  }

  return {
    title: `${concept.label} | GEMI Concepts`,
    description: concept.description,
  }
}

export default async function ConceptDetailPage({ params }: PageProps) {
  const { id } = await params
  const [concept, allConcepts, conceptDocs] = await Promise.all([
    getConceptById(id),
    getAllConcepts(),
    getConceptDocuments(id),
  ])

  if (!concept) {
    notFound()
  }

  const labelMap = new Map(allConcepts.map((item) => [item.id, item.label]))
  const decadeRows = Object.entries(concept.by_decade || {}).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
  const maxDecadeCount = decadeRows.length > 0 ? Math.max(...decadeRows.map(([, count]) => count)) : 1

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-10">
        <Link href="/concepts" className="nav-link inline-flex items-center gap-1 mb-8">
          ← Back to Concepts
        </Link>

        <h1 className="mb-4">{concept.label}</h1>
        <p className="text-lg text-ink-600 max-w-3xl mb-6">{concept.description}</p>

        <div className="grid sm:grid-cols-4 gap-4">
          <Stat label="Documents" value={concept.documents_with_hits.toLocaleString()} />
          <Stat label="Total Hits" value={concept.total_hits.toLocaleString()} />
          <Stat label="Decades" value={Object.keys(concept.by_decade || {}).length.toLocaleString()} />
          <Stat label="Languages" value={Object.keys(concept.by_language || {}).length.toLocaleString()} />
        </div>
      </section>

      <div className="rule" />

      <section className="container-content py-10 grid lg:grid-cols-[1fr_340px] gap-8">
        <div>
          <h2 className="mb-4">Evidence Excerpts</h2>
          <div className="space-y-4">
            {concept.key_excerpts.slice(0, 20).map((excerpt, index) => (
              <Link
                key={`${excerpt.doc_id}-${excerpt.start_char}-${index}`}
                href={{
                  pathname: `/document/${excerpt.doc_id}`,
                  query: {
                    q: excerpt.variant,
                    start: String(excerpt.start_char),
                    end: String(excerpt.end_char),
                  },
                }}
                className="block p-4 border border-paper-200 rounded-sm hover:border-copper-400 hover:bg-paper-50 transition-all"
              >
                <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-ink-500">
                  <span className="date-stamp">{excerpt.year}</span>
                  <span className="tag">{excerpt.language_code}</span>
                  <span className="tag">{excerpt.topic}</span>
                  <span className="tag">{excerpt.variant}</span>
                </div>
                <h3 className="font-serif text-base text-ink-900 mb-2 line-clamp-2">{excerpt.title}</h3>
                <p className="text-sm text-ink-700 leading-relaxed">
                  {renderTextWithHighlights(excerpt.text, findTextHits(excerpt.text, [excerpt.variant], { maxHits: 12 }), {
                    className: 'search-highlight',
                    activeClassName: '',
                  })}
                </p>
              </Link>
            ))}
            {concept.key_excerpts.length === 0 && (
              <p className="text-sm text-ink-500">No excerpts available for this concept yet.</p>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="bg-paper-100 border border-paper-200 rounded-sm p-4">
            <h3 className="text-base mb-3">Timeline (Docs by Decade)</h3>
            <div className="space-y-2">
              {decadeRows.map(([decade, count]) => {
                const width = Math.max(6, Math.round((count / maxDecadeCount) * 100))
                return (
                  <div key={decade} className="text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-ink-600">{decade}</span>
                      <span className="font-mono text-ink-500">{count}</span>
                    </div>
                    <div className="h-2 bg-paper-200 rounded-sm overflow-hidden">
                      <div className="h-full bg-copper-500/80" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                )
              })}
              {decadeRows.length === 0 && <p className="text-sm text-ink-500">No decade data yet.</p>}
            </div>
          </div>

          <div className="bg-paper-100 border border-paper-200 rounded-sm p-4">
            <h3 className="text-base mb-3">Related Concepts</h3>
            <div className="space-y-2">
              {concept.related_concepts.slice(0, 8).map((related) => (
                <Link key={related.concept_id} href={`/concepts/${related.concept_id}`} className="flex items-center justify-between text-sm hover:text-copper-700 transition-colors">
                  <span>{labelMap.get(related.concept_id) || related.concept_id}</span>
                  <span className="font-mono text-xs text-ink-500">{related.count}</span>
                </Link>
              ))}
              {concept.related_concepts.length === 0 && (
                <p className="text-sm text-ink-500">No co-occurrence data yet.</p>
              )}
            </div>
          </div>

          <div className="bg-paper-100 border border-paper-200 rounded-sm p-4">
            <h3 className="text-base mb-3">Top Documents</h3>
            <div className="space-y-3">
              {conceptDocs.slice(0, 10).map((doc) => {
                const firstSnippet = doc.snippets?.[0]
                return (
                  <Link
                    key={doc.doc_id}
                    href={{
                      pathname: `/document/${doc.doc_id}`,
                      query: firstSnippet
                        ? {
                            q: firstSnippet.variant,
                            start: String(firstSnippet.start_char),
                            end: String(firstSnippet.end_char),
                          }
                        : { q: concept.label },
                    }}
                    className="block hover:text-copper-700 transition-colors"
                  >
                    <div className="text-sm font-medium line-clamp-2">{doc.title}</div>
                    <div className="mt-1 text-xs text-ink-500 flex items-center gap-2">
                      <span>{doc.year}</span>
                      <span>·</span>
                      <span>{doc.language_code}</span>
                      <span>·</span>
                      <span>{doc.hit_count} hits</span>
                    </div>
                  </Link>
                )
              })}
              {conceptDocs.length === 0 && <p className="text-sm text-ink-500">No document hits yet.</p>}
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper-100 border border-paper-200 rounded-sm p-3">
      <div className="meta-label mb-1">{label}</div>
      <div className="font-mono text-xl text-ink-900">{value}</div>
    </div>
  )
}
