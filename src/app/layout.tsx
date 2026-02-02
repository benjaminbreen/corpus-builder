import type { Metadata } from 'next'
import { Source_Serif_4, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
})

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

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
    <html
      lang="en"
      className={`${sourceSerif.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
    >
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
