import Link from 'next/link'

export const dynamic = 'force-static'

const PATHWAYS = [
  {
    href: '/pathways/automata-to-ai',
    title: 'From Automata to AI',
    description:
      'A curated sequence of primary sources tracing how discussions of automata and calculating devices evolve into modern machine-intelligence discourse.',
    stops: 9,
    span: '1637–1923',
  },
  {
    href: '/pathways/animal-machine',
    title: 'The Animal Machine',
    description:
      'From Descartes\' bête-machine to Pavlov\'s reflexes — the centuries-long debate over whether living beings are machines, and what "machine" even means.',
    stops: 9,
    span: '1637–2000',
  },
  {
    href: '/pathways/mechanical-turk',
    title: 'The Mechanical Turk',
    description:
      'The famous chess-playing automaton and the broader question of simulation — can a machine\'s performance ever prove real intelligence?',
    stops: 9,
    span: '1742–1952',
  },
]

export default function PathwaysPage() {
  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-10">
        <h1 className="mb-4">Thematic Pathways</h1>
        <p className="text-lg text-ink-600 max-w-3xl">
          Curated routes through GEMI sources designed for teaching and guided exploration.
        </p>
      </section>

      <div className="rule" />

      <section className="container-content py-10">
        <div className="grid gap-6 max-w-2xl">
          {PATHWAYS.map((pathway) => (
            <Link
              key={pathway.href}
              href={pathway.href}
              className="block p-6 bg-paper-50 border border-paper-200 rounded-sm hover:border-copper-400 hover:bg-paper-100 transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl">{pathway.title}</h2>
                <span className="font-mono text-xs text-ink-400">{pathway.span}</span>
              </div>
              <p className="text-sm text-ink-700 leading-relaxed mb-3">
                {pathway.description}
              </p>
              <div className="font-mono text-xs text-copper-700">
                {pathway.stops} stops →
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
