import Link from 'next/link'
import { getAllConcepts, getTermsData } from '@/lib/terms'

export const dynamic = 'force-static'

export default async function ConceptsPage() {
  const [concepts, termsData] = await Promise.all([getAllConcepts(), getTermsData()])

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-10">
        <h1 className="mb-4">Concept Genealogies</h1>
        <p className="text-lg text-ink-600 max-w-3xl">
          Explore 12 core concepts across the GEMI corpus with timeline counts, top sources, and excerpt-level evidence.
        </p>
        <div className="mt-4 text-sm text-ink-500">
          Corpus: {termsData.corpus_size.toLocaleString()} documents
          {termsData.generated_at && (
            <span> · Index built {new Date(termsData.generated_at).toLocaleDateString()}</span>
          )}
        </div>
      </section>

      <div className="rule" />

      <section className="container-content py-10">
        {concepts.length === 0 ? (
          <div className="bg-paper-100 border border-paper-200 rounded-sm p-6 text-sm text-ink-600">
            Concept index not found. Run <code>npm run build:terms</code> to generate concept data.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {concepts.map((concept) => {
              const languageCount = Object.keys(concept.by_language || {}).length
              const decadeCount = Object.keys(concept.by_decade || {}).length
              return (
                <Link
                  key={concept.id}
                  href={`/concepts/${concept.id}`}
                  className="group block p-5 bg-paper-50 border border-paper-200 rounded-sm hover:border-copper-400 hover:bg-paper-100 transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h2 className="text-xl leading-tight group-hover:text-copper-700 transition-colors">{concept.label}</h2>
                    <span className="font-mono text-xs text-copper-700 bg-copper-100 px-2 py-1 rounded-sm shrink-0">
                      {concept.id}
                    </span>
                  </div>
                  <p className="text-sm text-ink-600 leading-relaxed mb-4 line-clamp-4">{concept.description}</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Metric label="Docs" value={concept.documents_with_hits.toLocaleString()} />
                    <Metric label="Hits" value={concept.total_hits.toLocaleString()} />
                    <Metric label="Decades" value={decadeCount.toLocaleString()} />
                    <Metric label="Languages" value={languageCount.toLocaleString()} />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="meta-label">{label}</div>
      <div className="font-mono text-ink-900">{value}</div>
    </div>
  )
}
