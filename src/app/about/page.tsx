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
          <p>
            GEMI is a <strong>work-in-progress prototype</strong> from a team of researchers at
            the University of California, Santa Cruz. It is a digital archive recovering
            the <em>prehistory of artificial intelligence</em> — the centuries of debate about
            cognition, automation, and the thinking machine that preceded contemporary AI discourse.
          </p>

          <p>
            The archive collects primary sources relating to computation, mechanism, and
            intelligence from <strong>1600 to 2000</strong>, spanning multiple languages and
            genres. Materials are drawn from Project Gutenberg, the Internet Archive,
            Wikisource, and other open-access repositories.
          </p>

        </div>
      </section>
    </div>
  )
}
