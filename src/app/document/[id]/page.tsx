import Link from 'next/link'
import { getDocument, getCorpus, LANGUAGE_NAMES, TOPIC_NAMES } from '@/lib/corpus'
import { getQuotesByDocument } from '@/lib/quotes'
import { notFound } from 'next/navigation'
import { TextViewer } from '@/components/TextViewer'
import { AuthorInfo } from '@/components/AuthorInfo'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateStaticParams() {
  const corpus = await getCorpus()
  return corpus.map((doc) => ({ id: doc.identifier }))
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const doc = await getDocument(id)
  if (!doc) {
    return { title: 'Document Not Found | GEMI' }
  }
  return {
    title: `${doc.title} | GEMI`,
    description: doc.description || `A ${doc.year} document from the GEMI archive.`,
  }
}

export default async function DocumentPage({ params }: PageProps) {
  const { id } = await params
  const doc = await getDocument(id)
  const quotes = await getQuotesByDocument(id)

  if (!doc) {
    notFound()
  }

  const decade = Math.floor(doc.year / 10) * 10

  return (
    <div className="animate-fade-in">
      <section className="container-content pt-16 pb-8">
        <Link
          href={`/decade/${decade}`}
          className="nav-link inline-flex items-center gap-1 mb-8"
        >
          ← Back to {decade}s
        </Link>

        <h1 className="text-2xl md:text-3xl mb-4 leading-snug">{doc.title}</h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-ink-500">
          <span className="font-mono text-lg">{doc.year}</span>
          {doc.creator && (
            <>
              <span className="text-ink-300">·</span>
              <span>{doc.creator}</span>
            </>
          )}
        </div>
      </section>

      <div className="rule" />

      {/* Metadata sidebar + content */}
      <section className="container-content py-8">
        <div className="grid lg:grid-cols-[280px_1fr] gap-8">
          {/* Metadata panel */}
          <aside className="lg:sticky lg:top-24 lg:self-start space-y-4">
            {/* Author info from Wikipedia */}
            {doc.creator && <AuthorInfo creator={doc.creator} />}

            <div className="bg-paper-100 border border-paper-200 rounded-sm p-5 space-y-4">
              {doc.publication_year ? (
                <MetadataRow label="Publication Year" value={doc.publication_year.toString()} />
              ) : (
                <MetadataRow label="Year" value={doc.year.toString()} />
              )}
              {doc.gutenberg_release_year && (
                <MetadataRow label="Gutenberg Release" value={doc.gutenberg_release_year.toString()} />
              )}
              {doc.year_source && (
                <div>
                  <div className="meta-label mb-0.5">Year Source</div>
                  <div className="font-sans text-sm text-ink-700">{doc.year_source}</div>
                </div>
              )}
              <MetadataRow label="Language" value={LANGUAGE_NAMES[doc.language_code] || doc.language_code} />
              <MetadataRow label="Topic" value={TOPIC_NAMES[doc.topic] || doc.topic} />
              <MetadataRow label="Characters" value={doc.char_count.toLocaleString()} />

              {doc.description && (
                <div>
                  <div className="meta-label mb-1">Description</div>
                  <p className="font-sans text-sm text-ink-600 leading-relaxed">
                    {typeof doc.description === 'string'
                      ? doc.description
                      : Array.isArray(doc.description)
                      ? doc.description[0]
                      : ''}
                  </p>
                </div>
              )}

              <div className="pt-2 space-y-2">
                <a
                  href={doc.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary w-full justify-center text-sm"
                >
                  {doc.source === 'gutenberg' ? 'View on Project Gutenberg ↗' : 'View on Internet Archive ↗'}
                </a>
              </div>
            </div>

            {/* Navigation */}
            <div className="mt-4 flex gap-2">
              <Link href={`/decade/${decade}`} className="tag hover:bg-paper-300 transition-colors">
                {decade}s
              </Link>
              <Link href={`/topic/${doc.topic}`} className="tag hover:bg-paper-300 transition-colors">
                {TOPIC_NAMES[doc.topic] || doc.topic}
              </Link>
              <Link href={`/language/${doc.language_code}`} className="tag hover:bg-paper-300 transition-colors">
                {LANGUAGE_NAMES[doc.language_code] || doc.language_code}
              </Link>
            </div>

          </aside>

          {/* Document content */}
          <main>
            {doc.summary && (
              <div className="mb-6 bg-copper-50 border border-copper-200 rounded-sm p-4">
                <div className="flex items-start gap-3">
                  <span className="text-copper-600 text-lg mt-0.5">✦</span>
                  <div>
                    <div className="text-xs font-medium text-copper-700 uppercase tracking-wide mb-1">Summary</div>
                    <p className="text-sm text-ink-700 leading-relaxed">{doc.summary}</p>
                  </div>
                </div>
              </div>
            )}

            <TextViewer
              filename={doc.filename ?? null}
              supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL || ''}
              hasTranslation={doc.has_translation}
              translationFilename={doc.translation_filename}
              originalLanguage={doc.language}
            />

            {quotes.length > 0 && (
              <section className="mt-8 bg-paper-50 border border-paper-200 rounded-sm p-6">
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-lg">Key Quotes</h3>
                  <Link href="/quotes" className="nav-link text-sm">
                    Browse all →
                  </Link>
                </div>
                <div className="space-y-4">
                  {quotes.map((quote) => (
                    <blockquote key={quote.id} className="border-l-2 border-copper-300 pl-4">
                      <p
                        className="font-serif text-ink-800 leading-relaxed mb-2"
                        dangerouslySetInnerHTML={{
                          __html: `&ldquo;${quote.text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}&rdquo;`,
                        }}
                      />
                      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                        <span className="font-mono">{quote.year}</span>
                        {quote.page && (
                          <>
                            <span className="text-ink-300">·</span>
                            <span>p. {quote.page}</span>
                          </>
                        )}
                        <span className="text-ink-300">·</span>
                        <span className="flex flex-wrap gap-2">
                          {quote.tags.map((tag) => (
                            <span key={tag} className="tag">
                              {tag}
                            </span>
                          ))}
                        </span>
                      </div>
                    </blockquote>
                  ))}
                </div>
              </section>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="meta-label mb-0.5">{label}</div>
      <div className="font-sans text-sm text-ink-900">{value}</div>
    </div>
  )
}
