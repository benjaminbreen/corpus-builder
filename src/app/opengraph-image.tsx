import { ImageResponse } from 'next/og'

export const alt = 'GEMI: Genealogies of Engines, Machines, and Intelligences'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#faf8f3',
          color: '#1c1917',
          fontFamily: 'serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 26, letterSpacing: 4, color: '#9a5b34' }}>
          GEMI · DIGITAL ARCHIVE
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 76, lineHeight: 1.1 }}>
            Genealogies of Engines, Machines, and Intelligences
          </div>
          <div style={{ fontSize: 32, marginTop: 28, color: '#57534e', lineHeight: 1.35 }}>
            How the words we now use for AI (learning, reasoning, intelligence,
            hallucination) were debated across centuries.
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#78716c' }}>
          University of California, Santa Cruz
        </div>
      </div>
    ),
    size,
  )
}
