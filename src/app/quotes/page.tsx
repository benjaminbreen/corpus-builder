import { QuotesBrowser } from '@/components/QuotesBrowser'
import { getQuotes } from '@/lib/quotes'

export const metadata = {
  title: 'Key Quotes | GEMI',
  description: 'Curated excerpts from the GEMI corpus, tagged by theme.',
}

export default async function QuotesPage() {
  const quotes = await getQuotes()

  return (
    <div className="animate-fade-in">
      <QuotesBrowser
        quotes={quotes}
        title="Key Quotes"
        subtitle="Curated excerpts with precise tags. Filter by theme, then sort by time or language."
      />
    </div>
  )
}
