/**
 * Fetch a thumbnail URL from the Wikipedia REST API.
 * Used at build time only — no runtime cost.
 */
export async function getWikipediaThumbnail(
  title: string,
  width = 200,
): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(title)
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GEMI-CorpusBuilder/1.0 (educational research project)' },
      next: { revalidate: 86400 * 7 }, // cache for 1 week
    })

    if (!res.ok) return null

    const data = await res.json()
    const thumb = data?.thumbnail?.source
    if (!thumb) return null

    // Request a specific width by rewriting the wikimedia thumb URL
    return thumb.replace(/\/\d+px-/, `/${width}px-`)
  } catch {
    return null
  }
}
