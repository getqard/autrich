/**
 * Website Header Screenshot — screenshotone.com
 *
 * Captures the top 400px of a website for AI color analysis.
 * Returns null on any failure (non-fatal).
 */

export async function captureHeader(url: string): Promise<Buffer | null> {
  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY
  if (!accessKey) {
    console.log('[Screenshot] No SCREENSHOTONE_ACCESS_KEY, skipping')
    return null
  }

  try {
    const params = new URLSearchParams({
      access_key: accessKey,
      url,
      viewport_width: '1280',
      viewport_height: '400',
      full_page: 'false',
      format: 'png',
      block_cookie_banners: 'true',
      block_chats: 'true',
      delay: '2',
      timeout: '15',
    })

    const apiUrl = `https://api.screenshotone.com/take?${params.toString()}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(apiUrl, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) {
      console.log(`[Screenshot] API returned ${res.status}: ${await res.text().catch(() => 'no body')}`)
      return null
    }

    const buffer = Buffer.from(await res.arrayBuffer())

    if (buffer.length < 1000) {
      console.log(`[Screenshot] Response too small (${buffer.length}B), skipping`)
      return null
    }

    console.log(`[Screenshot] Captured ${url} → ${buffer.length}B`)
    return buffer
  } catch (err) {
    console.log(`[Screenshot] Failed (non-fatal): ${err instanceof Error ? err.message : err}`)
    return null
  }
}
