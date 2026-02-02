import Link from 'next/link'
import { getDocumentsByDecade, getAllDecades, getCorpusStats } from '@/lib/corpus'
import { DocumentList } from '@/components/DocumentList'
import { TimelineMini } from '@/components/Timeline'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateStaticParams() {
  const decades = await getAllDecades()
  return decades.map((decade) => ({ id: decade.toString() }))
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  return {
    title: `${id}s | GEMI`,
    description: `Documents from the ${id}s in the GEMI archive.`,
  }
}

export default async function DecadePage({ params }: PageProps) {
  const { id } = await params
  const decade = parseInt(id)

  if (isNaN(decade)) {
    notFound()
  }

  const documents = await getDocumentsByDecade(decade)
  const stats = await getCorpusStats()

  // Determine previous and next decades with documents
  const decadesWithDocs = stats.decades.sort((a, b) => a - b)
  const currentIndex = decadesWithDocs.indexOf(decade)
  const prevDecade = currentIndex > 0 ? decadesWithDocs[currentIndex - 1] : null
  const nextDecade = currentIndex < decadesWithDocs.length - 1 ? decadesWithDocs[currentIndex + 1] : null

  // Get context about the century
  const century = Math.floor(decade / 100)
  const centuryLabel = century === 16 ? '17th' : century === 17 ? '18th' : century === 18 ? '19th' : '20th'

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-8">
        <Link href="/decade" className="nav-link inline-flex items-center gap-1 mb-8">
          ← All Decades
        </Link>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <div className="meta-label mb-2">{centuryLabel} Century</div>
            <h1 className="text-4xl md:text-5xl">{decade}s</h1>
          </div>

          {/* Decade navigation */}
          <div className="flex items-center gap-2">
            {prevDecade ? (
              <Link
                href={`/decade/${prevDecade}`}
                className="btn-ghost text-sm"
              >
                ← {prevDecade}s
              </Link>
            ) : (
              <span className="btn-ghost text-sm opacity-30 cursor-not-allowed">← Earlier</span>
            )}
            <span className="text-ink-300">|</span>
            {nextDecade ? (
              <Link
                href={`/decade/${nextDecade}`}
                className="btn-ghost text-sm"
              >
                {nextDecade}s →
              </Link>
            ) : (
              <span className="btn-ghost text-sm opacity-30 cursor-not-allowed">Later →</span>
            )}
          </div>
        </div>

        <p className="text-lg text-ink-500">
          {documents.length} {documents.length === 1 ? 'document' : 'documents'} from this decade
        </p>
      </section>

      {/* Mini timeline showing context */}
      <section className="container-content pb-8">
        <div className="max-w-md">
          <div className="meta-label mb-2">Timeline Context</div>
          <TimelineMini
            data={stats.byDecade}
            startYear={Math.max(1600, decade - 50)}
            endYear={Math.min(2000, decade + 60)}
          />
          <div className="flex justify-between mt-1 font-mono text-xs text-ink-400">
            <span>{Math.max(1600, decade - 50)}s</span>
            <span className="text-copper-700 font-medium">{decade}s</span>
            <span>{Math.min(2000, decade + 60)}s</span>
          </div>
        </div>
      </section>

      <div className="rule" />

      <section className="container-content py-12">
        <DocumentList
          documents={documents}
          showFilters={true}
          showSort={true}
          initialSort="year-asc"
          emptyMessage={`No documents from the ${decade}s in the archive yet.`}
        />
      </section>
    </div>
  )
}
