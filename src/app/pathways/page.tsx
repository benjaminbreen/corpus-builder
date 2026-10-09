import Link from 'next/link'
import { PATHWAYS } from '@/lib/pathways'

export const dynamic = 'force-static'

export default function PathwaysPage() {
  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-10">
        <h1 className="mb-4">Thematic Pathways</h1>
        <p className="text-lg text-ink-600 max-w-3xl">
          Curated routes through GEMI sources, designed for teaching and for anyone new to the history of thinking machines. Each pathway is a sequence of primary sources with short commentary, read in order.
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
