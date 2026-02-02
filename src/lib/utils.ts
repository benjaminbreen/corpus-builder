/**
 * Utility functions for the GEMI corpus interface
 */

/**
 * Get the decade from a year
 */
export function getDecade(year: number): number {
  return Math.floor(year / 10) * 10
}

/**
 * Get the century from a year (returns "17" for 1600s, etc.)
 */
export function getCentury(year: number): string {
  return Math.floor(year / 100).toString()
}

/**
 * Format a decade for display (e.g., "1740s")
 */
export function formatDecade(decade: number): string {
  return `${decade}s`
}

/**
 * Format a number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString()
}

/**
 * Truncate text to a maximum length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + '...'
}

/**
 * Slugify a string for URLs
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/**
 * Get contrasting text color for a background
 */
export function getContrastColor(hexColor: string): 'white' | 'black' {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? 'black' : 'white'
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Class name helper (like clsx but simpler)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
