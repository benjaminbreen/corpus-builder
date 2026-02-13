import Link from 'next/link'
import { getDocumentsByTopic, getAllTopics, getCorpusStats, TOPIC_NAMES, TOPIC_ALIASES } from '@/lib/corpus'
import { DocumentList } from '@/components/DocumentList'
import { TimelineMini } from '@/components/Timeline'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateStaticParams() {
  const topics = await getAllTopics()
  return topics.map((topic) => ({ id: topic }))
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const topicKey = TOPIC_ALIASES[id] || id
  const displayName = TOPIC_NAMES[topicKey] || topicKey
  return {
    title: `${displayName} | GEMI`,
    description: `Documents about ${displayName.toLowerCase()} in the GEMI archive.`,
  }
}

const TOPIC_DESCRIPTIONS: Record<string, string> = {
  automata_artificial_beings: 'Clockwork figures, androids, mechanical chess players, and speculative machines that imitate life and mind.',
  computing: 'From mechanical calculation to electronic computation and the dream of automated arithmetic.',
  logic_formal_reasoning: 'Systems of inference, symbolic logic, and attempts to mechanize reasoning.',
  intelligence: 'Debates on intellect, reason, cognition, and the boundaries of agency.',
  learning: 'Memory, habit, training, and the long history of how minds acquire knowledge.',
  mechanism: 'The mechanical philosophy, machinery, and the universe imagined as clockwork.',
  statistics_probability: 'Probability, error, regression, and the statistical foundations of prediction.',
  cybernetics: 'Feedback, control, systems thinking, and the networks of communication and regulation.',
  automation: 'Mechanization of labor, automatic control, and the social consequences of machine work.',
  representation_symbol_systems: 'Signs, symbols, notation, and the dream of universal or formal languages.',
}

export default async function TopicPage({ params }: PageProps) {
  const { id } = await params
  const topicKey = TOPIC_ALIASES[id] || id
  const documents = await getDocumentsByTopic(topicKey)
  const stats = await getCorpusStats()
  const displayName = TOPIC_NAMES[topicKey] || topicKey
  const topicQuery = topicKey.replace(/_/g, ' ')

  if (documents.length === 0) {
    const allTopics = await getAllTopics()
    if (!allTopics.includes(topicKey)) {
      notFound()
    }
  }

  // Build timeline data for just this topic
  const topicByDecade: Record<number, number> = {}
  documents.forEach((doc) => {
    const decade = Math.floor(doc.year / 10) * 10
    topicByDecade[decade] = (topicByDecade[decade] || 0) + 1
  })

  // Get year range for this topic
  const years = documents.map((d) => d.year)
  const minYear = years.length > 0 ? Math.min(...years) : 1600
  const maxYear = years.length > 0 ? Math.max(...years) : 2000

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-8">
        <Link href="/topic" className="nav-link inline-flex items-center gap-1 mb-8">
          ← All Topics
        </Link>

        <h1 className="mb-4">{displayName}</h1>

        {TOPIC_DESCRIPTIONS[topicKey] && (
          <p className="text-lg text-ink-600 max-w-2xl mb-6">
            {TOPIC_DESCRIPTIONS[topicKey]}
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

      {/* Topic timeline */}
      {documents.length > 0 && (
        <section className="container-content pb-8">
          <div className="max-w-2xl">
            <div className="meta-label mb-2">Distribution Over Time</div>
            <TimelineMini data={topicByDecade} />
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
          showTopic={false}
          linkQuery={topicQuery}
          initialSort="year-asc"
          emptyMessage={`No documents on ${displayName.toLowerCase()} in the archive yet.`}
        />
      </section>
    </div>
  )
}
