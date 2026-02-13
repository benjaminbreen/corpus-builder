import Link from 'next/link'
import { getDocument } from '@/lib/corpus'
import { getWikipediaThumbnail } from '@/lib/wikipedia'
import { PathwayTimeline, type PathwayStop } from '@/components/PathwayTimeline'

export const dynamic = 'force-static'

const STOPS: PathwayStop[] = [
  {
    id: 'b30358711',
    note: 'Vaucanson\'s flute-player amazes Europe — a machine that really plays music by blowing air through mechanical lips. The age of exhibition automata begins.',
    wikipedia: 'Jacques_de_Vaucanson',
  },
  {
    id: 'bim_eighteenth-century_a-description-of-several_1780',
    note: 'Jaquet-Droz\'s writing and drawing automata blur craft and cognition — machines that compose letters and sketch portraits.',
    wikipedia: 'Jaquet-Droz_automata',
  },
  {
    id: 'bub_gb_SLYUAAAAYAAJ',
    note: 'First published analysis of Kempelen\'s chess automaton. Can a machine really play chess, or must intelligence be hidden inside?',
    wikipedia: 'Mechanical_Turk',
  },
  {
    id: 'bim_eighteenth-century_the-speaking-figure-and_thicknesse-philip-1719_1784',
    note: 'Debunking literature emerges — the Turk must conceal a human, because machines cannot reason. But the arguments reveal as much about assumptions as about the machine.',
    wikipedia: 'Wolfgang_von_Kempelen',
  },
  {
    id: 'gutenberg_60420',
    note: 'Willis\'s careful mechanical analysis: if no human is hidden, what would that imply about thought? The chess automaton becomes a philosophical experiment.',
  },
  {
    id: 'bub_gb_TcsCAAAAYAAJ',
    note: 'Mid-century chess culture absorbs the automaton legend, turning it into a parable about the nature of strategic thinking.',
  },
  {
    id: 'gutenberg_55817',
    note: 'Cooke surveys the full history from ancient temple tricks to Victorian exhibition halls, cataloguing every famous automaton and its reception.',
    wikipedia: 'Automaton',
  },
  {
    id: 'gutenberg_59112',
    note: 'Čapek coins "robot" — the question flips from "is it faking intelligence?" to "what if it stops obeying?" Simulation becomes rebellion.',
    wikipedia: 'R.U.R.',
  },
  {
    id: 'gutenberg_31611',
    note: 'Cold War robot fiction inherits the Turk\'s anxiety: machines that look obedient but harbor autonomy. The deception now runs in both directions.',
  },
]

export default async function MechanicalTurkPathwayPage() {
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
        <h1 className="mb-4">The Mechanical Turk</h1>
        <p className="text-lg text-ink-600 max-w-3xl">
          The famous chess-playing automaton and the broader question of simulation — can a
          machine's performance ever prove real intelligence?
        </p>
      </section>

      <div className="rule" />

      <section className="container-content py-10">
        <PathwayTimeline stops={docs} />
      </section>
    </div>
  )
}
