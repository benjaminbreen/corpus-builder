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
          Explore thematic collections across computing, automata, intelligence, and more.
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
    calculating_machines: 'Difference engines, analytical engines, mechanical calculators, and arithmetic machines.',
    automata: 'Clockwork figures, mechanical men, android machines, and self-moving devices.',
    thinking_machines: 'Mechanical brains, reasoning machines, and early concepts of machine intelligence.',
    computing: 'Electronic brains, digital computers, stored programs, and information machines.',
    cybernetics: 'Feedback control, servomechanisms, and self-regulating systems.',
    automation: 'Automatic control, robots, and the automation of labor.',
    intelligence: 'Philosophical debates on intellect, reason, cognition, and understanding.',
    learning: 'Memory, habit formation, training, and the nature of learning.',
    mechanism: 'Mechanical philosophy, clockwork universe, and debates on materialism.',
    statistics_probability: 'Probability theory, regression, correlation, and the mathematical foundations of prediction.',
  }
  return descriptions[topic] || 'Historical texts exploring this concept.'
}
