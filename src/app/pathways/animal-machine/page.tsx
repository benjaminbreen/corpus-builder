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
    note: 'Benjamin Waterhouse, speaking to a society devoted to reviving the apparently drowned, argues for a "principle of vitality" that mechanical explanation cannot capture.',
    wikipedia: 'Benjamin_Waterhouse',
  },
  {
    id: '10367865bsb',
    note: 'The physician Joachim Dietrich Brandis tries to define Lebenskraft ("life force"), the question of what separates a living body from a machine that dominated German physiology around 1800.',
    wikipedia: 'Joachim_Dietrich_Brandis',
  },
  {
    id: 'bub_gb__f1TQoJzqOIC',
    note: 'Marey\'s chronophotography literalizes the metaphor — captures animal locomotion as mechanical sequence, making the "animal machine" visible.',
    wikipedia: 'Étienne-Jules_Marey',
  },
  {
    id: 'jamesiana_james_habit_1890',
    note: 'William James recasts learning as habit: repetition physically reshapes nervous tissue, so the living machine is one that rebuilds itself as it is used.',
    wikipedia: 'William_James',
  },
  {
    id: 'storyoflivingmac00connrich',
    note: 'Popular synthesis collapses the debate: the body is a machine, just an extraordinarily complex one. Mechanism wins by absorption.',
  },
  {
    id: 'mechanismusundv00btgoog',
    note: 'The zoologist Otto Bütschli defends mechanistic explanation against the neo-vitalism of Hans Driesch and others, who argued that mechanism cannot explain development or purpose.',
    wikipedia: 'Otto_Bütschli',
  },
  {
    id: 'CuenotIFB',
    note: 'The biologist Lucien Cuénot argues that organisms show invention and purpose (finalité) that strict mechanism struggles to explain, carrying the old debate into the age of genetics.',
    wikipedia: 'Lucien_Cuénot',
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
          From Descartes' bête-machine to 20th-century biology, tracing the centuries-long debate
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
