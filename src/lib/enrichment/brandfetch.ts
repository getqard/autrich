/**
 * Brandfetch Logo API Client
 *
 * Free tier: 500K requests/month
 * Returns 512x512 PNG logos with optional lettermark fallback.
 */

export type BrandfetchResult = {
  buffer: Buffer
  source: 'brandfetch' | 'brandfetch-lettermark'
}

/**
 * Fetch a logo from Brandfetch CDN.
 * Domain should be bare (e.g. "vapiano.de" not "https://vapiano.de").
 */
export async function fetchBrandfetchLogo(domain: string): Promise<BrandfetchResult | null> {
  const clientId = process.env.BRANDFETCH_CLIENT_ID
  if (!clientId) return null

  // Clean domain: strip protocol, www, trailing slash
  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim()

  if (!cleanDomain) return null

  const url = `https://cdn.brandfetch.io/${encodeURIComponent(cleanDomain)}/w/512/h/512/theme/dark/logo?fallback=lettermark&c=${clientId}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'image/*',
      },
    })
    clearTimeout(timeout)

    if (!response.ok) return null

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (buffer.length < 100) return null

    // If Content-Length < 1000, it's likely a lettermark fallback
    const source: BrandfetchResult['source'] = buffer.length < 1000
      ? 'brandfetch-lettermark'
      : 'brandfetch'

    return { buffer, source }
  } catch {
    // Timeout or network error
    return null
  }
}
