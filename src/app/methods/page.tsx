import Link from 'next/link'
import { getCorpusStats } from '@/lib/corpus'
import { getTermsData } from '@/lib/terms'

export const dynamic = 'force-static'

export default async function MethodsPage() {
  const [stats, terms] = await Promise.all([getCorpusStats(), getTermsData()])

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-10">
        <h1 className="mb-4">Methods & Limits</h1>
        <p className="text-lg text-ink-600 max-w-3xl">
          How the GEMI corpus is built, searched, and what its current limitations are.
        </p>
      </section>

      <div className="rule" />

      <section className="container-content py-10 grid lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <h2 className="mb-2">Corpus Snapshot</h2>
            <ul className="text-sm text-ink-700 space-y-1">
              <li>Documents indexed: {stats.totalDocuments}</li>
              <li>Date range: {stats.startYear}–{stats.endYear}</li>
              <li>Languages: {stats.languages.length}</li>
              <li>Topics: {stats.topics.length}</li>
              <li>Concepts tracked: {terms.concepts.length}</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2">Sources</h2>
            <p className="text-sm text-ink-700 leading-relaxed">
              Texts are drawn from Project Gutenberg, the Internet Archive, Wikisource,
              HathiTrust, and Google Books, supplemented by hand-curated lists of key works
              defined in YAML config files. Ingestion scripts handle downloading, OCR processing,
              and metadata extraction for each source.
            </p>
          </div>

          <div>
            <h2 className="mb-2">OCR & Text Quality</h2>
            <p className="text-sm text-ink-700 leading-relaxed">
              Many source texts come from digitized scans with variable OCR quality.
              A heuristic scoring system (0–100) evaluates each text on 16 metrics including
              symbol density, vowel-less words, noise lines, and junk tokens. Texts can be
              post-corrected using Ollama or Gemini-based cleanup scripts.
              Pages flagged as gibberish are filtered from the reader view.
            </p>
          </div>

          <div>
            <h2 className="mb-2">Concept Indexing</h2>
            <p className="text-sm text-ink-700 leading-relaxed">
              Concept pages are generated from a terms config that defines each concept with
              multilingual lexical variants (English, French, German, Russian, Latin).
              Each concept page shows document-level hit counts, decade distribution,
              and linked evidence excerpts.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="mb-2">Search</h2>
            <p className="text-sm text-ink-700 leading-relaxed">
              Search blends three scoring components: semantic similarity (via OpenAI
              text-embedding-3-small), lexical match strength, and a source-quality prior.
              Default weights: semantic 0.45, lexical 0.35, quality 0.20.
              When the embedding API is unavailable, search falls back to lexical (0.75)
              and quality (0.25) scoring only.
            </p>
          </div>

          <div>
            <h2 className="mb-2">Translations</h2>
            <p className="text-sm text-ink-700 leading-relaxed">
              Non-English texts can have full-document LLM translations (generated via Gemini)
              and inline paragraph-level translations on demand. All translations are clearly
              marked as AI-generated.
            </p>
          </div>

          <div>
            <h2 className="mb-2">Known Limitations</h2>
            <ul className="text-sm text-ink-700 space-y-1 list-disc pl-5">
              <li>OCR quality varies significantly across source archives.</li>
              <li>Term matching can over-count polysemous forms in noisy text.</li>
              <li>Semantic search quality depends on embedding index freshness.</li>
              <li>Corpus coverage is intentionally narrow in this prototype.</li>
              <li>LLM-generated translations and summaries may contain errors.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2">Pathways</h2>
            <p className="text-sm text-ink-700 leading-relaxed mb-3">
              Curated thematic pathways offer guided routes through the corpus, with
              Wikipedia-sourced thumbnails fetched at build time.
            </p>
            <Link href="/pathways" className="btn-secondary text-sm">
              View Pathways
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
