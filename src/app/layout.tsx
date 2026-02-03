import type { Metadata } from 'next'
import './globals.css'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: 'GEMI | Genealogies of Engines, Machines, and Intelligences',
  description: 'A digital archive exploring the prehistory of artificial intelligence through historical texts from 1600-2000.',
  keywords: ['AI history', 'artificial intelligence', 'automata', 'thinking machines', 'digital humanities', 'corpus'],
  authors: [{ name: 'Benjamin Breen' }, { name: 'Pranav Anand' }],
  openGraph: {
    title: 'GEMI | Genealogies of Engines, Machines, and Intelligences',
    description: 'A digital archive exploring the prehistory of artificial intelligence.',
    type: 'website',
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
      </body>
    </html>
  )
}
