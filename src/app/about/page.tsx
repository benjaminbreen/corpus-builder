import Link from 'next/link'

export const metadata = {
  title: 'About | GEMI',
  description: 'About the GEMI digital archive project and its mission to recover the prehistory of artificial intelligence.',
}

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
        <div className="prose prose-lg max-w-none">
          <h2>The Project</h2>
          <p>
            GEMI is a digital archive recovering the <em>prehistory of artificial intelligence</em> —
            the centuries of debate about cognition, automation, and the thinking machine that
            preceded contemporary AI discourse.
          </p>

          <p>
            When AI researchers speak of systems as "reasoning" or "learning," they unconsciously
            reference centuries of philosophical debate while treating these terms as purely technical.
            The computer scientist Philip Agre diagnosed this phenomenon as <strong>formalization
            as social forgetting</strong>: as concepts from ordinary language are co-opted by
            computational modeling, their original semantic complexity is lost.
          </p>

          <p>
            This forgetting matters because the forgotten material has now escaped the laboratory.
            As AI terminology circulates in public discourse, it carries its buried assumptions
            with it, shaping how we understand intelligence, agency, automation, creativity, and work.
          </p>

          <h2>The Archive</h2>
          <p>
            GEMI offers a freely accessible database of primary sources relating to debates about
            computation, mechanism, and intelligence from <strong>1600 to 2000</strong>. Sources include:
          </p>
          <ul>
            <li>Philosophical treatises</li>
            <li>Scientific papers</li>
            <li>Speculative fiction</li>
            <li>Patent applications</li>
            <li>Newspaper articles</li>
            <li>Dictionary definitions</li>
          </ul>

          <p>
            Materials span multiple languages — English, French, German, Russian, Spanish, and
            Italian — to capture the transnational development of these concepts.
          </p>

          <h2>Research Questions</h2>
          <ol>
            <li>
              How have the meanings of terms like <em>intelligence</em>, <em>learning</em>,
              <em>reasoning</em>, <em>automation</em>, and <em>agency</em> shifted as they
              migrated across disciplines?
            </li>
            <li>
              What metaphorical frameworks have shaped how we imagined thinking machines?
            </li>
            <li>
              How have debates about machine intelligence intersected with shifting conceptions
              of human, animal, and more-than-human cognition?
            </li>
            <li>
              What can the history of statistics reveal about the ideological freight carried
              by contemporary AI?
            </li>
          </ol>

          <h2>Principal Investigators</h2>
          <p>
            <strong>Benjamin Breen</strong> — Digital Methods, History of Science<br />
            <strong>Pranav Anand</strong> — Corpus Linguistics, Faculty Director of The Humanities Institute
          </p>
          <p>
            University of California, Santa Cruz
          </p>

          <h2>Funding</h2>
          <p>
            GEMI is supported by the <strong>National Endowment for the Humanities</strong>.
          </p>

          <h2>How to Cite</h2>
          <p>
            Breen, Benjamin and Pranav Anand. "GEMI: Genealogies of Engines, Machines, and
            Intelligences." UC Santa Cruz, 2024. https://gemi.ucsc.edu
          </p>
        </div>
      </section>

      <div className="rule" />

      <section className="container-content py-12">
        <h2 className="mb-6">Contact</h2>
        <p className="text-ink-600 mb-4">
          For questions about the project or to suggest sources for inclusion:
        </p>
        <a
          href="mailto:gemi@ucsc.edu"
          className="btn-secondary"
        >
          gemi@ucsc.edu
        </a>
      </section>
    </div>
  )
}
