import Link from 'next/link'
import { getDocument } from '@/lib/corpus'
import { getWikipediaThumbnail } from '@/lib/wikipedia'
import { PathwayTimeline, type PathwayStop } from '@/components/PathwayTimeline'

export const dynamic = 'force-static'

const STOPS: PathwayStop[] = [
  {
    id: 'bub_gb_s6lSHDngPFoC',
    note: 'Early modern method and mechanism discourse sets epistemic framing for machine-like thought.',
    wikipedia: 'René_Descartes',
  },
  {
    id: 'b33049683',
    note: 'Seventeenth-century mathematical mechanica links formal reasoning with engineered devices.',
    wikipedia: 'William_Oughtred',
  },
  {
    id: 'bub_gb_N7kUAAAAYAAJ',
    note: 'Automaton chess debates foreground simulation, deception, and the boundary of cognition.',
    wikipedia: 'Mechanical_Turk',
  },
  {
    id: 'wikisource_sketch_analytical_engine',
    note: 'Lovelace-era writing reframes machines as symbol manipulators rather than mere calculators.',
    wikipedia: 'Analytical_engine',
  },
  {
    id: 'wikisource_darwin_among_the_machines',
    note: 'Speculative evolutionary framing introduces adaptive machine futures and social anxiety.',
    wikipedia: 'Samuel_Butler_(novelist)',
  },
  {
    id: 'wikisource_calculating_machines_popular_science',
    note: 'Popular-science treatment normalizes machine intelligence metaphors for broader publics.',
  },
  {
    id: 'wikisource_eb1911_calculating_machines',
    note: 'Encyclopedic codification stabilizes terminology before digital computing fully emerges.',
    wikipedia: 'Encyclopædia_Britannica_Eleventh_Edition',
  },
  {
    id: 'wikisource_interview_father_calculating_machine',
    note: 'Retrospective accounts narrate invention lineages that later AI narratives inherit.',
    wikipedia: 'Dorr_Eugene_Felt',
  },
  {
    id: 'gutenberg_59112',
    note: 'Interwar cultural imagination of artificial persons widens machine agency discourse.',
    wikipedia: 'R.U.R.',
  },
]

export default async function AutomataToAIPathwayPage() {
  const docs = await Promise.all(
    STOPS.map(async (stop) => ({
      stop,
      doc: await getDocument(stop.id),
      thumbnailUrl: stop.wikipedia ? await getWikipediaThumbnail(stop.wikipedia) : null,
    })),
  )

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-10">
        <Link href="/pathways" className="nav-link inline-flex items-center gap-1 mb-8">
          ← Back to Pathways
        </Link>
        <h1 className="mb-4">From Automata to AI</h1>
        <p className="text-lg text-ink-600 max-w-3xl">
          A guided sequence through primary sources showing how automata discourse becomes machine-intelligence discourse.
        </p>
      </section>

      <div className="rule" />

      <section className="container-content py-10">
        <PathwayTimeline stops={docs} />
      </section>
    </div>
  )
}
