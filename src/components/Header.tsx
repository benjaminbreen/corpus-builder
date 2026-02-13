'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const primaryItems = [
  { href: '/concepts', label: 'Concepts' },
  { href: '/pathways', label: 'Pathways' },
]

const browseItems = [
  { href: '/decade', label: 'By Decade' },
  { href: '/topic', label: 'By Topic' },
  { href: '/language', label: 'By Language' },
  { href: '/quotes', label: 'Quotes' },
]

const utilityItems = [
  { href: '/methods', label: 'Methods' },
  { href: '/about', label: 'About' },
]

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [browseOpen, setBrowseOpen] = useState(false)
  const browseRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k') return
      if (!event.metaKey && !event.ctrlKey) return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (target?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select') return

      event.preventDefault()
      router.push('/search')
    }

    window.addEventListener('keydown', handleGlobalSearchShortcut)
    return () => window.removeEventListener('keydown', handleGlobalSearchShortcut)
  }, [router])

  useEffect(() => {
    setBrowseOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!browseOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (browseRef.current && !browseRef.current.contains(event.target as Node)) {
        setBrowseOpen(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBrowseOpen(false)
    }

    window.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [browseOpen])

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const browseIsActive = browseItems.some((item) => isActive(item.href))

  return (
    <header className="sticky top-0 z-50 bg-paper-50/95 backdrop-blur-sm border-b border-paper-200/80">
      <div className="container-content">
        <div className="flex items-center justify-between h-16 md:h-[4.5rem]">
          {/* Logo */}
          <Link href="/" className="group flex items-baseline gap-2">
            <span className="font-serif text-xl md:text-2xl text-ink-900 tracking-tight">
              GEMI
            </span>
            <span className="hidden sm:inline font-sans text-xs text-ink-400 group-hover:text-ink-500 transition-colors">
              1600–2000
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-10">
            {/* Primary navigation */}
            <nav className="flex items-center gap-7">
              {primaryItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative py-1 font-sans text-sm transition-colors duration-150 ${
                    isActive(item.href)
                      ? 'text-ink-900'
                      : 'text-ink-500 hover:text-ink-900'
                  }`}
                >
                  {item.label}
                  {isActive(item.href) && (
                    <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-copper-500" />
                  )}
                </Link>
              ))}

              <div className="relative" ref={browseRef}>
                <button
                  type="button"
                  onClick={() => setBrowseOpen((prev) => !prev)}
                  className={`relative inline-flex items-center gap-1 py-1 font-sans text-sm transition-colors duration-150 ${
                    browseIsActive || browseOpen
                      ? 'text-ink-900'
                      : 'text-ink-500 hover:text-ink-900'
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={browseOpen}
                >
                  Browse
                  <span className={`transition-transform ${browseOpen ? 'rotate-180' : ''}`}>▾</span>
                  {browseIsActive && <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-copper-500" />}
                </button>

                {browseOpen && (
                  <div
                    className="absolute left-0 mt-2 w-48 rounded-sm border border-paper-300 bg-paper-50 shadow-subtle p-1.5 z-20"
                    role="menu"
                    aria-label="Browse sections"
                  >
                    {browseItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block rounded-sm px-2.5 py-1.5 font-sans text-sm transition-colors ${
                          isActive(item.href)
                            ? 'bg-copper-50 text-copper-900'
                            : 'text-ink-600 hover:bg-paper-100 hover:text-ink-900'
                        }`}
                        role="menuitem"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </nav>

            {/* Utility links */}
            <nav className="flex items-center gap-4">
              {utilityItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`font-sans text-xs uppercase tracking-wide transition-colors ${
                    isActive(item.href)
                      ? 'text-ink-800'
                      : 'text-ink-400 hover:text-ink-700'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Search shortcut */}
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-ink-500
                       bg-paper-100 border border-paper-200 rounded-sm
                       hover:border-paper-300 hover:text-ink-700 transition-all"
            title="Search (Cmd/Ctrl+K)"
          >
            <SearchIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline ml-1 px-1.5 py-0.5 text-[11px] font-mono text-ink-500 bg-paper-50 rounded border border-paper-200">
              ⌘/Ctrl K
            </kbd>
          </Link>
        </div>
      </div>

      {/* Desktop-only fallback nav for medium widths */}
      <div className="md:hidden border-t border-paper-200/70">
        <div className="container-content py-2">
          <nav className="flex items-center gap-4 overflow-x-auto whitespace-nowrap">
            {[...primaryItems, ...browseItems].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`font-sans text-sm ${
                  isActive(item.href) ? 'text-ink-900' : 'text-ink-500'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  )
}
