import Link from 'next/link'
import { getDocument } from '@/lib/corpus'
import { getWikipediaThumbnail } from '@/lib/wikipedia'
import { PathwayTimeline, type PathwayStop } from '@/components/PathwayTimeline'

export const dynamic = 'force-static'

const STOPS: PathwayStop[] = [
  {
    id: 'bub_gb_s6lSHDngPFoC',
    note: 'Descartes proposes animals are automata — soulless machines obeying mechanical law. The bête-machine thesis launches centuries of debate.',
    wikipedia: 'René_Descartes',
  },
  {
    id: 'b30520903_0002',
    note: 'Medical mechanism applies Cartesian physics to the body, treating organs as hydraulic devices and the nervous system as a network of pipes.',
  },
  {
    id: '2576049R.nlm.nih.gov',
    note: 'Rush argues life resists mechanical reduction — introduces the "vital principle" as an irreducible force distinct from physics and chemistry.',
    wikipedia: 'Benjamin_Rush',
  },
  {
    id: '10367865bsb',
    note: 'Humboldt experimentally probes Lebenskraft with galvanic experiments on muscle tissue, testing the boundary between chemistry and life.',
    wikipedia: 'Alexander_von_Humboldt',
  },
  {
    id: 'bub_gb__f1TQoJzqOIC',
    note: 'Marey\'s chronophotography literalizes the metaphor — captures animal locomotion as mechanical sequence, making the "animal machine" visible.',
    wikipedia: 'Étienne-Jules_Marey',
  },
  {
    id: 'storyoflivingmac00connrich',
    note: 'Popular synthesis collapses the debate: the body is a machine, just an extraordinarily complex one. Mechanism wins by absorption.',
  },
  {
    id: 'mechanismusundv00btgoog',
    note: 'German neo-vitalists mount a philosophical counterattack — mechanism cannot explain purpose, development, or the unity of the organism.',
    wikipedia: 'Hans_Driesch',
  },
  {
    id: 'CuenotIFB',
    note: 'Canguilhem historicizes the whole debate, showing how "machine" was always a shifting metaphor shaped by the technology of each era.',
    wikipedia: 'Georges_Canguilhem',
  },
  {
    id: 'ivan-pavlov-exploring-the-animal-machine-oxford-portraits-in-science-by-daniel-todes-z-lib.org',
    note: 'Pavlov\'s conditioned reflexes complete the circle — the animal machine now runs on signals and learning, not clockwork.',
    wikipedia: 'Ivan_Pavlov',
  },
]

export default async function AnimalMachinePathwayPage() {
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
        <h1 className="mb-4">The Animal Machine</h1>
        <p className="text-lg text-ink-600 max-w-3xl">
          From Descartes' bête-machine to Pavlov's reflexes — tracing the centuries-long debate
          over whether living beings are machines.
        </p>
      </section>

      <div className="rule" />

      <section className="container-content py-10">
        <PathwayTimeline stops={docs} />
      </section>
    </div>
  )
}
