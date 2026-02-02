/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm neutrals - aged paper aesthetic
        paper: {
          50: '#FDFBF7',
          100: '#F5F1EA',
          200: '#E5DFD5',
          300: '#D4C4B0',
          400: '#B8A892',
        },
        // Warm text colors
        ink: {
          900: '#2C2825',
          700: '#4A4541',
          500: '#6B635A',
          400: '#9C948A',
          300: '#B8B0A6',
        },
        // Oxidized copper accent
        copper: {
          700: '#8B5A3C',
          500: '#A67B5B',
          400: '#C4956A',
          300: '#D4B896',
          200: '#E8D5C0',
        },
        // Highlight for search results
        highlight: '#FFF3CD',
      },
      fontFamily: {
        serif: ['var(--font-source-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-ibm-plex-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-ibm-plex-mono)', 'monospace'],
      },
      fontSize: {
        // Slightly larger base for readability
        base: ['1.0625rem', { lineHeight: '1.7' }],
        lg: ['1.1875rem', { lineHeight: '1.7' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      maxWidth: {
        'prose': '68ch',
        'content': '1140px',
      },
      boxShadow: {
        'page': '4px 0 8px -2px rgba(44, 40, 37, 0.08)',
        'subtle': '0 1px 3px rgba(44, 40, 37, 0.06)',
      },
      backgroundImage: {
        // Subtle paper grain texture
        'grain': `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%' height='100%' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      },
    },
  },
  plugins: [],
}
