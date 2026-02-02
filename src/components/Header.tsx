'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/search', label: 'Search' },
  { href: '/decade', label: 'By Decade' },
  { href: '/topic', label: 'By Topic' },
  { href: '/language', label: 'By Language' },
  { href: '/quotes', label: 'Quotes' },
  { href: '/about', label: 'About' },
]

export function Header() {
  const pathname = usePathname()
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-200 ${
        isScrolled
          ? 'bg-paper-50/95 backdrop-blur-sm shadow-subtle'
          : 'bg-transparent'
      }`}
    >
      <div className="container-content">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="group flex items-baseline gap-2">
            <span className="font-serif text-xl md:text-2xl text-ink-900 tracking-tight">
              GEMI
            </span>
            <span className="hidden sm:inline font-sans text-xs text-ink-400 group-hover:text-ink-500 transition-colors">
              1600–2000
            </span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
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
                  <span className="absolute -bottom-0.5 left-0 right-0 h-0.5 bg-copper-500" />
                )}
              </Link>
            ))}
          </nav>

          {/* Search shortcut */}
          <Link
            href="/search"
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-ink-400
                       bg-paper-100 border border-paper-200 rounded-sm
                       hover:border-paper-300 hover:text-ink-500 transition-all"
          >
            <SearchIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline ml-2 px-1.5 py-0.5 text-xs font-mono bg-paper-50 rounded">
              ⌘K
            </kbd>
          </Link>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-ink-500 hover:text-ink-900"
            aria-label="Menu"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom rule */}
      <div className="rule" />
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

function MenuIcon({ className }: { className?: string }) {
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
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  )
}
