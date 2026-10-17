import type { Metadata } from 'next'
import './globals.css'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  title: 'GEMI | Genealogies of Engines, Machines, and Intelligences',
  metadataBase: new URL('https://corpus-builder.vercel.app'),
  description: 'A digital archive tracing how the words we now use for AI (learning, reasoning, intelligence, hallucination) were debated across centuries of texts. A prototype from UC Santa Cruz.',
  keywords: ['AI history', 'artificial intelligence', 'automata', 'thinking machines', 'digital humanities', 'corpus'],
  authors: [
    { name: 'Pranav Anand' },
    { name: 'Benjamin Breen' },
    { name: 'Leilani Gilpin' },
    { name: 'Zac Zimmer' },
  ],
  openGraph: {
    title: 'GEMI | Genealogies of Engines, Machines, and Intelligences',
    description: 'How the words we now use for AI were debated across centuries. A prototype archive from UC Santa Cruz.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GEMI | Genealogies of Engines, Machines, and Intelligences',
    description: 'How the words we now use for AI were debated across centuries.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
        <Analytics />
      </body>
    </html>
  )
}
