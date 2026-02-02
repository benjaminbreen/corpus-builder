import Link from 'next/link'
import { getDocumentsByLanguage, getAllLanguages, LANGUAGE_NAMES } from '@/lib/corpus'
import { DocumentList } from '@/components/DocumentList'
import { TimelineMini } from '@/components/Timeline'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateStaticParams() {
  const languages = await getAllLanguages()
  return languages.map((lang) => ({ id: lang }))
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const displayName = LANGUAGE_NAMES[id] || id
  return {
    title: `${displayName} | GEMI`,
    description: `${displayName} language documents in the GEMI archive.`,
  }
}

const LANGUAGE_DESCRIPTIONS: Record<string, string> = {
  en: 'English-language texts from Britain, America, and the wider Anglophone world, tracing debates about machines and minds from the Royal Society to Silicon Valley.',
  fr: 'French texts from the Enlightenment philosophes to the pioneers of information theory, including Descartes, La Mettrie, and the automaton-makers of Paris.',
  de: 'German philosophical and technical writings, from Leibniz\'s calculating machines to the mathematical foundations of computation.',
  ru: 'Russian contributions to cybernetics, computing, and the theory of automata, including the Soviet computing tradition.',
  es: 'Spanish-language texts on mechanism, automation, and intelligence from Spain and Latin America.',
  it: 'Italian writings on mechanical philosophy, automata, and the nature of mind, from the Renaissance to the modern era.',
}

export default async function LanguagePage({ params }: PageProps) {
  const { id } = await params
  const documents = await getDocumentsByLanguage(id)
  const displayName = LANGUAGE_NAMES[id] || id

  if (documents.length === 0) {
    const allLanguages = await getAllLanguages()
    if (!allLanguages.includes(id)) {
      notFound()
    }
  }

  // Build timeline data for just this language
  const langByDecade: Record<number, number> = {}
  documents.forEach((doc) => {
    const decade = Math.floor(doc.year / 10) * 10
    langByDecade[decade] = (langByDecade[decade] || 0) + 1
  })

  // Get year range
  const years = documents.map((d) => d.year)
  const minYear = years.length > 0 ? Math.min(...years) : 1600
  const maxYear = years.length > 0 ? Math.max(...years) : 2000

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-8">
        <Link href="/language" className="nav-link inline-flex items-center gap-1 mb-8">
          ← All Languages
        </Link>

        <div className="flex items-baseline gap-4 mb-4">
          <h1>{displayName}</h1>
          <span className="font-mono text-lg text-ink-400 uppercase">{id}</span>
        </div>

        {LANGUAGE_DESCRIPTIONS[id] && (
          <p className="text-lg text-ink-600 max-w-2xl mb-6">
            {LANGUAGE_DESCRIPTIONS[id]}
          </p>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-ink-500">
          <span className="font-mono">
            {documents.length} {documents.length === 1 ? 'document' : 'documents'}
          </span>
          {years.length > 0 && (
            <>
              <span className="text-ink-300">·</span>
              <span className="font-mono">{minYear}–{maxYear}</span>
            </>
          )}
        </div>
      </section>

      {/* Language timeline */}
      {documents.length > 0 && (
        <section className="container-content pb-8">
          <div className="max-w-2xl">
            <div className="meta-label mb-2">Distribution Over Time</div>
            <TimelineMini data={langByDecade} />
            <div className="flex justify-between mt-1 font-mono text-xs text-ink-400">
              <span>1600s</span>
              <span>2000s</span>
            </div>
          </div>
        </section>
      )}

      <div className="rule" />

      <section className="container-content py-12">
        <DocumentList
          documents={documents}
          showFilters={true}
          showSort={true}
          showLanguage={false}
          initialSort="year-asc"
          emptyMessage={`No ${displayName} documents in the archive yet.`}
        />
      </section>
    </div>
  )
}
