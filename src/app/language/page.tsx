import Link from 'next/link'
import { getCorpusStats, LANGUAGE_NAMES } from '@/lib/corpus'

export const metadata = {
  title: 'Browse by Language | GEMI',
  description: 'Explore the GEMI corpus organized by language.',
}

export default async function LanguagesPage() {
  const stats = await getCorpusStats()

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-12">
        <Link href="/" className="nav-link inline-flex items-center gap-1 mb-8">
          ← Back to Home
        </Link>

        <h1 className="mb-4">Browse by Language</h1>
        <p className="text-lg text-ink-600 max-w-2xl">
          Access texts across six languages to trace the transnational development
          of ideas about machines and intelligence.
        </p>
      </section>

      <div className="rule" />

      <section className="container-content py-12">
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
          {stats.languages.map((langCode) => (
            <Link
              key={langCode}
              href={`/language/${langCode}`}
              className="group block p-6 bg-paper-100 border border-paper-200 rounded-sm
                         hover:border-copper-400 hover:bg-paper-50 transition-all"
            >
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-serif text-xl text-ink-900 group-hover:text-copper-700 transition-colors">
                  {LANGUAGE_NAMES[langCode] || langCode}
                </h3>
                <span className="font-mono text-sm text-ink-400 uppercase">
                  {langCode}
                </span>
              </div>
              <div className="font-mono text-sm text-copper-700">
                {stats.byLanguage[langCode] || 0} documents
              </div>
            </Link>
          ))}
        </div>

        {stats.languages.length === 0 && (
          <p className="text-center text-ink-400 py-12">
            No documents in the corpus yet. Run the corpus builder to add texts.
          </p>
        )}
      </section>

      <div className="rule" />

      <section className="container-content py-12">
        <h2 className="mb-4">About Multilingual Support</h2>
        <p className="text-ink-600 max-w-2xl">
          GEMI incorporates materials in English, French, German, Russian, Spanish, and Italian
          to capture the transnational development of concepts around machines, intelligence,
          and automation. This multilingual approach reveals how ideas circulated across
          linguistic boundaries and took on different connotations in different intellectual traditions.
        </p>
      </section>
    </div>
  )
}
