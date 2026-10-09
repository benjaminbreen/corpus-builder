import Link from 'next/link'
import { getCorpusStats } from '@/lib/corpus'
import { getAllConcepts } from '@/lib/terms'

export const metadata = {
  title: 'Data | GEMI',
  description: 'Download the GEMI catalog, texts, and concept index.',
}

const REPO_URL = 'https://github.com/benjaminbreen/corpus-builder'

export default async function DataPage() {
  const [stats, concepts] = await Promise.all([getCorpusStats(), getAllConcepts()])

  const downloads = [
    {
      title: 'Catalog (CSV)',
      href: '/data/catalog.csv',
      detail: `One row per document: title, creator, year, language, topic, source, and a short description. ${stats.totalDocuments} rows.`,
    },
    {
      title: 'Catalog (JSON)',
      href: '/data/corpus-index.json',
      detail: 'The same catalog with full metadata, as used by this site.',
    },
    {
      title: 'Concept index (JSON)',
      href: '/data/terms.json',
      detail: `Counts by decade, language, and source for the ${concepts.length} tracked concepts, with excerpt-level evidence.`,
    },
  ]

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-12">
        <h1 className="mb-4">Data</h1>
        <p className="text-lg text-ink-600 max-w-2xl">
          GEMI is open by design. Everything shown on this site can be downloaded and reused.
        </p>
      </section>

      <div className="rule" />

      <section className="container-content py-12">
        <div className="grid gap-6 max-w-2xl">
          {downloads.map((item) => (
            <a
              key={item.href}
              href={item.href}
              download
              className="block p-6 bg-paper-50 border border-paper-200 rounded-sm hover:border-copper-400 hover:bg-paper-100 transition-all"
            >
              <div className="flex items-baseline justify-between gap-4 mb-2">
                <h2 className="text-xl">{item.title}</h2>
                <span className="font-mono text-xs text-copper-700">Download ↓</span>
              </div>
              <p className="text-sm text-ink-600 leading-relaxed">{item.detail}</p>
            </a>
          ))}
        </div>

        <div className="max-w-2xl mt-12 space-y-4 text-ink-700 leading-relaxed">
          <h2 className="text-2xl">Full texts and code</h2>
          <p>
            Each document page shows its full text and links to the original digitized source. The
            complete texts, the ingestion and cleanup scripts, and the code for this site are
            available on{' '}
            <a href={REPO_URL} className="text-copper-700 underline" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            .
          </p>
          <p>
            Source texts were gathered from open-access repositories. Summaries and translations
            were produced with AI assistance and are marked as such; see{' '}
            <Link href="/methods" className="text-copper-700 underline">
              Methods &amp; Limits
            </Link>{' '}
            for how the corpus is built and where it falls short.
          </p>
        </div>
      </section>
    </div>
  )
}
