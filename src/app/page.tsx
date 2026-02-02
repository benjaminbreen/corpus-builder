import Link from 'next/link'
import { getCorpusStats } from '@/lib/corpus'
import { Timeline } from '@/components/Timeline'
import { DocumentCard } from '@/components/DocumentCard'

export default async function HomePage() {
  const stats = await getCorpusStats()

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="container-content pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="max-w-3xl">
          <h1 className="mb-6">
            <span className="block text-copper-700 font-sans text-sm uppercase tracking-widest mb-3">
              Digital Archive
            </span>
            Genealogies of Engines, Machines, and Intelligences
          </h1>
          <p className="text-lg md:text-xl text-ink-700 leading-relaxed mb-8 max-w-2xl">
            Recovering the prehistory of artificial intelligence through four centuries
            of texts on cognition, automation, and the thinking machine.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/search" className="btn-primary">
              Search the Archive
            </Link>
            <Link href="/about" className="btn-secondary">
              About the Project
            </Link>
          </div>
        </div>
      </section>

      <div className="rule" />

      {/* Stats bar */}
      <section className="container-content py-8">
        <div className="flex flex-wrap justify-center gap-x-12 gap-y-4">
          <Stat value={stats.totalDocuments.toLocaleString()} label="Documents" />
          <Stat value={`${stats.startYear}–${stats.endYear}`} label="Date Range" />
          <Stat value={stats.languages.length.toString()} label="Languages" />
          <Stat value={stats.topics.length.toString()} label="Topics" />
        </div>
      </section>

      <div className="rule" />

      {/* Interactive Timeline */}
      <section className="container-content py-16 md:py-20">
        <div className="text-center mb-10">
          <h2 className="mb-3">Four Centuries of Thinking Machines</h2>
          <p className="text-ink-500 max-w-xl mx-auto">
            Click on any decade to explore documents from that period.
            Bar height indicates the number of documents available.
          </p>
        </div>
        <div className="max-w-4xl mx-auto">
          <Timeline data={stats.byDecade} />
        </div>
      </section>

      <div className="rule" />

      {/* Browse by Century */}
      <section className="container-content py-16 md:py-20">
        <h2 className="text-center mb-12">Explore by Century</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <CenturyCard
            century="17th"
            years="1600–1699"
            count={stats.byCentury['17'] || 0}
            description="Mechanical philosophy, clockwork automata, Descartes"
            href="/decade?century=17"
          />
          <CenturyCard
            century="18th"
            years="1700–1799"
            count={stats.byCentury['18'] || 0}
            description="Vaucanson's duck, calculating machines, Enlightenment reason"
            href="/decade?century=18"
          />
          <CenturyCard
            century="19th"
            years="1800–1899"
            count={stats.byCentury['19'] || 0}
            description="Babbage, Lovelace, mechanical chess, industrial automation"
            href="/decade?century=19"
          />
          <CenturyCard
            century="20th"
            years="1900–2000"
            count={stats.byCentury['20'] || 0}
            description="Turing, cybernetics, electronic brains, AI emergence"
            href="/decade?century=20"
          />
        </div>
      </section>

      <div className="rule" />

      {/* Browse sections */}
      <section className="container-content py-16 md:py-20">
        <h2 className="text-center mb-12">Browse the Archive</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <BrowseCard
            href="/decade"
            title="By Decade"
            description="Navigate through 40 decades of intellectual history, from the 1600s to the 2000s."
            items={stats.decades.slice(-5).map(d => `${d}s`)}
            count={stats.decades.length}
          />
          <BrowseCard
            href="/topic"
            title="By Topic"
            description="Explore thematic collections across computing, automata, intelligence, and more."
            items={stats.topics.slice(0, 4)}
            count={stats.topics.length}
          />
          <BrowseCard
            href="/language"
            title="By Language"
            description="Access texts in English, French, German, Russian, Spanish, and Italian."
            items={stats.languages.slice(0, 4)}
            count={stats.languages.length}
          />
        </div>
      </section>

      <div className="rule" />

      {/* Featured quote */}
      <section className="container-prose py-16 md:py-20">
        <blockquote className="relative pl-8 md:pl-12">
          <span className="absolute left-0 top-0 text-6xl md:text-7xl text-copper-300/60 font-serif leading-none select-none">
            "
          </span>
          <p className="font-serif text-xl md:text-2xl text-ink-700 italic leading-relaxed mb-4">
            As concepts from ordinary language are co-opted by computational modeling,
            their original semantic complexity is lost.
          </p>
          <cite className="block font-sans text-sm text-ink-400 not-italic">
            — Philip Agre, on "formalization as social forgetting"
          </cite>
        </blockquote>
      </section>

      <div className="rule" />

      {/* Recent additions */}
      {stats.recentDocuments.length > 0 && (
        <section className="container-content py-16 md:py-20">
          <div className="flex items-baseline justify-between mb-8">
            <h2>Recent Additions</h2>
            <Link href="/decade" className="nav-link">
              Browse all →
            </Link>
          </div>
          <div className="space-y-1">
            {stats.recentDocuments.slice(0, 5).map((doc) => (
              <DocumentCard
                key={doc.identifier}
                document={doc}
                showDecade
              />
            ))}
          </div>
        </section>
      )}

      {/* Call to action */}
      <section className="bg-paper-100 border-y border-paper-200">
        <div className="container-content py-16 md:py-20 text-center">
          <h2 className="mb-4">Start Exploring</h2>
          <p className="text-ink-500 max-w-xl mx-auto mb-8">
            Search across {stats.totalDocuments} documents for phrases like
            "thinking machine," "mechanical brain," or "artificial intelligence."
          </p>
          <Link href="/search" className="btn-primary text-lg px-8 py-3">
            Search the Archive
          </Link>
        </div>
      </section>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-mono text-2xl md:text-3xl text-ink-900">{value}</div>
      <div className="meta-label mt-1">{label}</div>
    </div>
  )
}

function CenturyCard({
  century,
  years,
  count,
  description,
  href,
}: {
  century: string
  years: string
  count: number
  description: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="group block p-6 bg-paper-100 border border-paper-200 rounded-sm
                 hover:border-copper-400 hover:bg-paper-50 transition-all"
    >
      <div className="font-serif text-3xl text-ink-900 group-hover:text-copper-700 transition-colors mb-1">
        {century}
      </div>
      <div className="font-mono text-xs text-ink-400 mb-3">{years}</div>
      <p className="font-sans text-sm text-ink-500 leading-relaxed mb-4">
        {description}
      </p>
      <div className="font-mono text-sm text-copper-700">
        {count} {count === 1 ? 'document' : 'documents'}
      </div>
    </Link>
  )
}

function BrowseCard({
  href,
  title,
  description,
  items,
  count,
}: {
  href: string
  title: string
  description: string
  items: string[]
  count: number
}) {
  return (
    <Link
      href={href}
      className="group block p-6 border-l-2 border-paper-300
                 hover:border-copper-500 hover:bg-paper-100/50 transition-all"
    >
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-serif text-xl text-ink-900 group-hover:text-copper-700 transition-colors">
          {title}
        </h3>
        <span className="font-mono text-sm text-ink-400">{count}</span>
      </div>
      <p className="font-sans text-sm text-ink-500 leading-relaxed mb-4">
        {description}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="tag">
            {item}
          </span>
        ))}
        {count > items.length && (
          <span className="tag bg-transparent text-ink-400">+{count - items.length}</span>
        )}
      </div>
    </Link>
  )
}
