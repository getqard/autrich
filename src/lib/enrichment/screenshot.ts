/**
 * Website Screenshot — screenshotone.com
 *
 * Captures the above-the-fold area of a website for AI color analysis.
 * If desktop capture fails (< 50KB), retries with mobile viewport.
 * Returns null on any failure (non-fatal).
 */

export async function captureWebsite(url: string): Promise<Buffer | null> {
  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY
  if (!accessKey) {
    console.log('[Screenshot] No SCREENSHOTONE_ACCESS_KEY, skipping')
    return null
  }

  // Try desktop first
  const desktop = await takeScreenshot(accessKey, url, {
    viewport_width: '1440',
    viewport_height: '900',
    delay: '5',
  })

  if (desktop && desktop.length > 30000) {
    console.log(`[Screenshot] Captured ${url} → ${(desktop.length / 1024).toFixed(0)}KB (desktop 1440×900)`)
    return desktop
  }

  console.log(`[Screenshot] Desktop too small (${desktop?.length || 0}B < 30KB), retrying mobile...`)

  // Retry with mobile viewport (SPAs often render mobile better)
  const mobile = await takeScreenshot(accessKey, url, {
    viewport_width: '390',
    viewport_height: '844',
    delay: '7',
    device_scale_factor: '2',
  })

  if (mobile && mobile.length > 30000) {
    console.log(`[Screenshot] Captured ${url} → ${(mobile.length / 1024).toFixed(0)}KB (mobile 390×844 @2x)`)
    return mobile
  }

  console.log(`[Screenshot] Mobile also too small (${mobile?.length || 0}B < 30KB), retrying with reduced blocking...`)

  // Last attempt: no blocking (some sites need cookie banners to render)
  const noBlock = await takeScreenshot(accessKey, url, {
    viewport_width: '1440',
    viewport_height: '900',
    delay: '8',
    block_cookie_banners: 'false',
    block_chats: 'false',
    block_ads: 'false',
  })

  if (noBlock && noBlock.length > 10000) {
    console.log(`[Screenshot] Captured ${url} → ${(noBlock.length / 1024).toFixed(0)}KB (no-block fallback)`)
    return noBlock
  }

  console.log(`[Screenshot] All attempts failed for ${url} (site likely blocks headless browsers)`)
  return desktop || mobile || noBlock // return whatever we got, even if small
}

async function takeScreenshot(
  accessKey: string,
  url: string,
  overrides: Record<string, string>,
): Promise<Buffer | null> {
  try {
    const params = new URLSearchParams({
      access_key: accessKey,
      url,
      full_page: 'false',
      format: 'png',
      block_cookie_banners: 'true',
      block_chats: 'true',
      timeout: '20',
      ...overrides,
    })

    const apiUrl = `https://api.screenshotone.com/take?${params.toString()}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)

    const res = await fetch(apiUrl, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) {
      console.log(`[Screenshot] API returned ${res.status}`)
      return null
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 1000) return null

    return buffer
  } catch (err) {
    console.log(`[Screenshot] Attempt failed: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

/** @deprecated Use captureWebsite instead */
export const captureHeader = captureWebsite
