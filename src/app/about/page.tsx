import Link from 'next/link'

export const metadata = {
  title: 'About | GEMI',
  description: 'About GEMI, a digital archive tracing the long history of the words we now use for artificial intelligence.',
}

const TEAM = [
  {
    name: 'Pranav Anand',
    field: 'Linguistics',
    role: 'Overall vision; corpus-based tools for digitizing, extracting, and analyzing sources.',
  },
  {
    name: 'Benjamin Breen',
    field: 'History',
    role: 'Historiography and source collection; search and visualization design.',
  },
  {
    name: 'Leilani Gilpin',
    field: 'Computer Science & Engineering',
    role: 'Technical construction of GEMI; 20th-century computational sources.',
  },
  {
    name: 'Zac Zimmer',
    field: 'Literature',
    role: 'Metaphor and figuration; literary and speculative sources.',
  },
]

export default function AboutPage() {
  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-12">
        <Link href="/" className="nav-link inline-flex items-center gap-1 mb-8">
          ← Back to Home
        </Link>

        <h1 className="mb-4">About GEMI</h1>
        <p className="text-xl text-ink-600 max-w-2xl">
          Genealogies of Engines, Machines, and Intelligences
        </p>
      </section>

      <div className="rule" />

      <section className="container-prose py-12">
        <div className="space-y-5 text-lg text-ink-700 leading-relaxed [&_h2]:pt-6 [&_h2]:text-2xl [&_a]:text-copper-700 [&_a]:underline">
          <h2>Why this archive</h2>
          <p>
            Since 2022, the vocabulary of AI has entered everyday life. People now talk about
            models that <em>learn</em>, <em>reason</em>, and <em>hallucinate</em>. These words
            mean something specific in computer science, and something broader in everyday
            speech. Each also carries centuries of debate about minds, habits, rules, and
            machines that rarely reaches the people using them today.
          </p>
          <p>
            The computer scientist Philip Agre called this <em>formalization as social
            forgetting</em>: when an ordinary word becomes a technical term, much of its
            older complexity drops away. GEMI is a <strong>genealogy</strong> of these terms.
            It traces how their meanings were handed down, split, and redirected as they
            moved between philosophy, psychology, literature, engineering, and the press.
            The aim is to make terms we now take for granted visible as choices, opening
            room for more informed teaching and discussion about AI.
          </p>

          <h2>What the archive will hold</h2>
          <p>
            The full GEMI archive will be a free, open-source collection of primary sources
            from <strong>1500 to 2000</strong>: philosophical treatises, scientific papers,
            speculative fiction, patents, newspaper articles, dictionaries, and images.
            It will include material in English, French, German, Italian, Latin, Russian, and
            Spanish. It will offer full-text search, chronological browsing, guided pathways
            for teaching, and visualizations of how key terms shift over time.
          </p>
          <p>
            This site is a <strong>working prototype</strong>. Its current sample of
            documents, drawn from Project Gutenberg, the Internet Archive, Wikisource, and
            HathiTrust, shows how the archive will work; coverage is intentionally narrow.
            See <Link href="/methods">Methods &amp; Limits</Link> for how the corpus is built.
          </p>

          <h2>Who it is for</h2>
          <p>
            GEMI is designed for students and scholars in both the humanities and the
            computational sciences, and for any reader curious about where the language of
            AI comes from. Graduate and undergraduate fellows will help build it, locating
            and annotating sources and developing their own research projects. Its{' '}
            <Link href="/pathways">thematic pathways</Link> are built to be used in classrooms.
          </p>

          <h2>Team</h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mt-6">
          {TEAM.map((person) => (
            <div key={person.name} className="p-5 bg-paper-100 border border-paper-200 rounded-sm">
              <div className="font-serif text-lg text-ink-900">{person.name}</div>
              <div className="meta-label mt-1 mb-2">{person.field}</div>
              <p className="font-sans text-sm text-ink-500 leading-relaxed">{person.role}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 font-sans text-sm text-ink-500 leading-relaxed">
          GEMI is based at The Humanities Institute at the University of California, Santa Cruz,
          as part of its ±AI Initiative.
        </p>
      </section>
    </div>
  )
}
