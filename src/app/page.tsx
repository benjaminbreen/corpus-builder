import Link from 'next/link'
import { getCorpusStats, LANGUAGE_NAMES, TOPIC_NAMES } from '@/lib/corpus'
import { getAllConcepts } from '@/lib/terms'
import { PATHWAYS } from '@/lib/pathways'
import { Timeline } from '@/components/Timeline'
import { DocumentCard } from '@/components/DocumentCard'

export default async function HomePage() {
  const [stats, concepts] = await Promise.all([getCorpusStats(), getAllConcepts()])
  const languageNames = [...stats.languages]
    .sort((a, b) => (stats.byLanguage[b] || 0) - (stats.byLanguage[a] || 0))
    .map((code) => LANGUAGE_NAMES[code] || code)
  const featuredConcepts = ['intelligence', 'learning', 'reasoning', 'error']
    .map((id) => concepts.find((c) => c.id === id)?.label)
    .filter((label): label is string => Boolean(label))

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="container-content pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="max-w-3xl">
          <h1 className="mb-6">
            <span className="block text-copper-700 font-sans text-sm uppercase tracking-widest mb-3">
              Digital Archive · Prototype
            </span>
            Genealogies of Engines, Machines, and Intelligences
          </h1>
          <p className="text-lg md:text-xl text-ink-700 leading-relaxed mb-8 max-w-2xl">
            The words we now use for AI (<em>learning</em>, <em>reasoning</em>,{' '}
            <em>intelligence</em>, <em>hallucination</em>) were argued over for centuries
            before anyone built a computer. GEMI traces those debates through
            philosophy, science, fiction, and the popular press.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/pathways" className="btn-primary">
              Start with a Pathway
            </Link>
            <Link href="/search" className="btn-secondary">
              Search the Archive
            </Link>
            <Link href="/about" className="btn-secondary">
              About the Project
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2 font-sans text-sm">
            <span className="text-ink-400 mr-1">Try:</span>
            {SUGGESTED_SEARCHES.map((q) => (
              <Link key={q} href={`/search?q=${encodeURIComponent(q)}`} className="tag hover:bg-paper-200 transition-colors">
                {q}
              </Link>
            ))}
          </div>
          <p className="mt-8 font-sans text-sm text-ink-500 max-w-2xl leading-relaxed">
            This is a working prototype built at the University of California, Santa Cruz.
            The current sample of {stats.totalDocuments} documents demonstrates the
            archive&apos;s design; the full archive will span 1500–2000 across seven languages.
          </p>
        </div>
      </section>

      <div className="rule" />

      {/* Stats bar */}
      <section className="container-content py-8">
        <div className="flex flex-wrap justify-center gap-x-12 gap-y-4">
          <Stat value={stats.totalDocuments.toLocaleString()} label="Documents" />
          <Stat value={`${stats.startYear}–${stats.endYear}`} label="Date Range" />
          <Stat value={stats.languages.length.toString()} label="Languages" />
          <Stat value={concepts.length.toString()} label="Concepts Tracked" />
        </div>
      </section>

      <div className="rule" />

      {/* Interactive Timeline */}
      <section className="container-content py-16 md:py-20">
        <div className="text-center mb-10">
          <h2 className="mb-3">Thinking Machines, {stats.startYear}–{stats.endYear}</h2>
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
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <BrowseCard
            href="/decade"
            title="By Decade"
            description={`Navigate ${stats.decades.length} decades of sources, from the ${stats.decades[0]}s to the ${stats.decades[stats.decades.length - 1]}s.`}
            items={stats.decades.slice(0, 4).map(d => `${d}s`)}
            count={stats.decades.length}
          />
          <BrowseCard
            href="/topic"
            title="By Topic"
            description="Thematic collections from automata and calculating machines to the psychology of mind."
            items={stats.topics.slice(0, 4).map((t) => TOPIC_NAMES[t] || t)}
            count={stats.topics.length}
          />
          <BrowseCard
            href="/language"
            title="By Language"
            description={`Read sources in ${languageNames.join(', ').replace(/, ([^,]*)$/, ', and $1')}, with marked AI-assisted translations.`}
            items={languageNames.slice(0, 4)}
            count={stats.languages.length}
          />
          <BrowseCard
            href="/concepts"
            title="By Concept"
            description={`Trace ${concepts.length} key terms, including intelligence, learning, reasoning, and hallucination, across time and language.`}
            items={featuredConcepts}
            count={concepts.length}
          />
        </div>
      </section>

      <div className="rule" />

      {/* Pathways for newcomers */}
      <section className="container-content py-16 md:py-20">
        <div className="text-center mb-10">
          <h2 className="mb-3">New Here? Start with a Pathway</h2>
          <p className="text-ink-500 max-w-xl mx-auto">
            Guided sequences of primary sources with short commentary, for classrooms
            and curious readers. No background required.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PATHWAYS.map((pathway) => (
            <Link
              key={pathway.href}
              href={pathway.href}
              className="group block p-6 bg-paper-100 border border-paper-200 rounded-sm
                         hover:border-copper-400 hover:bg-paper-50 transition-all"
            >
              <div className="font-mono text-xs text-ink-400 mb-2">{pathway.span}</div>
              <h3 className="font-serif text-xl text-ink-900 group-hover:text-copper-700 transition-colors mb-2">
                {pathway.title}
              </h3>
              <p className="font-sans text-sm text-ink-500 leading-relaxed mb-4">
                {pathway.description}
              </p>
              <div className="font-mono text-xs text-copper-700">{pathway.stops} stops →</div>
            </Link>
          ))}
        </div>
      </section>

      <div className="rule" />

      {/* Recent additions */}
      {stats.recentDocuments.length > 0 && (
        <section className="container-content py-16 md:py-20">
          <div className="flex items-baseline justify-between mb-8">
            <h2>From the Collection</h2>
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
            &ldquo;thinking machine,&rdquo; &ldquo;calculating engine,&rdquo; or &ldquo;hallucination,&rdquo;
            or by meaning, with questions like &ldquo;can a machine be conscious?&rdquo;
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


const SUGGESTED_SEARCHES = [
  'thinking machine',
  'are we automata?',
  'hallucination',
  'calculating engine',
  'mental tests',
]
