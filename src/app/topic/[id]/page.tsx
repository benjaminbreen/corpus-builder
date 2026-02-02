import Link from 'next/link'
import { getDocumentsByTopic, getAllTopics, getCorpusStats, TOPIC_NAMES } from '@/lib/corpus'
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
  const displayName = TOPIC_NAMES[id] || id
  return {
    title: `${displayName} | GEMI`,
    description: `Documents about ${displayName.toLowerCase()} in the GEMI archive.`,
  }
}

const TOPIC_DESCRIPTIONS: Record<string, string> = {
  calculating_machines: 'From Pascal\'s Pascaline to Babbage\'s Analytical Engine, trace the history of mechanical computation and the dream of automated arithmetic.',
  automata: 'Clockwork figures, mechanical ducks, chess-playing Turks — the fascinating history of machines that imitate life.',
  thinking_machines: 'Philosophical debates and speculative designs for machines that might think, reason, and understand.',
  computing: 'The emergence of electronic computation, from theoretical foundations to practical machines.',
  cybernetics: 'Norbert Wiener\'s science of control and communication in animals and machines.',
  automation: 'The mechanization of labor and the social implications of automatic factories.',
  intelligence: 'Philosophical investigations into the nature of intellect, reason, and understanding.',
  learning: 'How do minds acquire knowledge? Historical debates on memory, habit, and instruction.',
  mechanism: 'The mechanical philosophy that saw the universe as a vast clockwork.',
  statistics_probability: 'From games of chance to regression to the mean — the mathematical foundations of prediction.',
}

export default async function TopicPage({ params }: PageProps) {
  const { id } = await params
  const documents = await getDocumentsByTopic(id)
  const stats = await getCorpusStats()
  const displayName = TOPIC_NAMES[id] || id

  if (documents.length === 0) {
    const allTopics = await getAllTopics()
    if (!allTopics.includes(id)) {
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

        {TOPIC_DESCRIPTIONS[id] && (
          <p className="text-lg text-ink-600 max-w-2xl mb-6">
            {TOPIC_DESCRIPTIONS[id]}
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
          initialSort="year-asc"
          emptyMessage={`No documents on ${displayName.toLowerCase()} in the archive yet.`}
        />
      </section>
    </div>
  )
}
