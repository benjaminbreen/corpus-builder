import Link from 'next/link'

export function Footer() {
  return (
    <footer className="mt-auto">
      <div className="rule" />

      <div className="container-content py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8">
          {/* About */}
          <div className="md:col-span-2">
            <h3 className="font-serif text-lg mb-3">
              Genealogies of Engines, Machines, and Intelligences
            </h3>
            <p className="font-sans text-sm text-ink-500 leading-relaxed max-w-md">
              A digital archive recovering the prehistory of artificial intelligence
              through four centuries of texts on cognition, automation, and the
              thinking machine.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="meta-label mb-4">Browse</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/decade" className="font-sans text-sm text-ink-500 hover:text-ink-900">
                  By Decade
                </Link>
              </li>
              <li>
                <Link href="/topic" className="font-sans text-sm text-ink-500 hover:text-ink-900">
                  By Topic
                </Link>
              </li>
              <li>
                <Link href="/language" className="font-sans text-sm text-ink-500 hover:text-ink-900">
                  By Language
                </Link>
              </li>
              <li>
                <Link href="/search" className="font-sans text-sm text-ink-500 hover:text-ink-900">
                  Search
                </Link>
              </li>
            </ul>
          </div>

          {/* Project */}
          <div>
            <h4 className="meta-label mb-4">Project</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/about" className="font-sans text-sm text-ink-500 hover:text-ink-900">
                  About GEMI
                </Link>
              </li>
              <li>
                <a
                  href="https://humanities.ucsc.edu"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-sm text-ink-500 hover:text-ink-900"
                >
                  UC Santa Cruz
                </a>
              </li>
              <li>
                <a
                  href="https://www.neh.gov"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-sm text-ink-500 hover:text-ink-900"
                >
                  NEH
                </a>
              </li>
              <li>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-sm text-ink-500 hover:text-ink-900"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-paper-200">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="font-sans text-xs text-ink-400">
              © {new Date().getFullYear()} Benjamin Breen & Pranav Anand.
              Supported by the National Endowment for the Humanities.
            </p>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs text-ink-400">
                {/* Document count will be dynamically inserted */}
                Corpus: 1600–2000
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
