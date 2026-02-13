import Link from 'next/link'
import { getCorpusStats, TOPIC_NAMES } from '@/lib/corpus'

export const metadata = {
  title: 'Browse by Topic | GEMI',
  description: 'Explore the GEMI corpus organized by thematic topics.',
}

export default async function TopicsPage() {
  const stats = await getCorpusStats()

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-12">
        <Link href="/" className="nav-link inline-flex items-center gap-1 mb-8">
          ← Back to Home
        </Link>

        <h1 className="mb-4">Browse by Topic</h1>
        <p className="text-lg text-ink-600 max-w-2xl">
          Explore thematic collections across computation, automation, intelligence, and more.
        </p>
      </section>

      <div className="rule" />

      <section className="container-content py-12">
        <div className="grid md:grid-cols-2 gap-6">
          {stats.topics.map((topic) => (
            <Link
              key={topic}
              href={`/topic/${topic}`}
              className="doc-card group block"
            >
              <h3 className="font-serif text-xl text-ink-900 group-hover:text-copper-700 transition-colors mb-2">
                {TOPIC_NAMES[topic] || topic}
              </h3>
              <p className="font-sans text-sm text-ink-500 mb-3">
                {getTopicDescription(topic)}
              </p>
              <div className="font-mono text-sm text-copper-700">
                {stats.byTopic[topic] || 0} documents
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function getTopicDescription(topic: string): string {
  const descriptions: Record<string, string> = {
    automata_artificial_beings: 'Clockwork figures, androids, mechanical chess players, and artificial beings.',
    computing: 'Calculating machines, computation, and the rise of electronic computing.',
    logic_formal_reasoning: 'Logical systems, symbolic inference, and reasoning machines.',
    intelligence: 'Intellect, cognition, agency, and theories of mind.',
    learning: 'Memory, habit, training, and the acquisition of knowledge.',
    mechanism: 'Mechanical philosophy, machinery, and the world as clockwork.',
    statistics_probability: 'Probability, error, regression, and statistical prediction.',
    cybernetics: 'Feedback, control, and systems of communication.',
    automation: 'Mechanization of labor, automatic control, and social change.',
    representation_symbol_systems: 'Signs, symbols, notation, and universal language projects.',
  }
  return descriptions[topic] || 'Historical texts exploring this concept.'
}
