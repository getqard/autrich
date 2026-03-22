/**
 * Website Screenshot — screenshotapi.net
 *
 * Captures the above-the-fold area of a website for AI color analysis.
 * If desktop capture fails (< 50KB), retries with mobile viewport,
 * then with no-blocking as last resort.
 *
 * Pricing: $29/mo for 10K screenshots (vs $79 at ScreenshotOne)
 * Features: Cookie banner blocking, ad blocking, chat widget blocking,
 *           JS injection, lazy loading, networkidle wait
 */

export async function captureWebsite(url: string): Promise<Buffer | null> {
  const token = process.env.SCREENSHOTAPI_TOKEN || process.env.SCREENSHOTONE_ACCESS_KEY
  if (!token) {
    console.log('[Screenshot] No SCREENSHOTAPI_TOKEN, skipping')
    return null
  }

  // Detect which API to use based on env var
  const useScreenshotAPI = !!process.env.SCREENSHOTAPI_TOKEN

  if (!useScreenshotAPI) {
    // Fallback to ScreenshotOne (legacy)
    return captureWithScreenshotOne(token, url)
  }

  // Try desktop first (networkidle waits for all requests to finish, no extra delay needed)
  const desktop = await takeScreenshotAPI(token, url, {
    width: '1440',
    height: '900',
    delay: '2000',
    wait_for_event: 'networkidle',
  })

  if (desktop && desktop.length > 50000) {
    console.log(`[Screenshot] Captured ${url} → ${(desktop.length / 1024).toFixed(0)}KB (desktop 1440×900)`)
    return desktop
  }

  console.log(`[Screenshot] Desktop too small (${desktop?.length || 0}B), retrying mobile...`)

  // Retry with mobile viewport
  const mobile = await takeScreenshotAPI(token, url, {
    width: '390',
    height: '844',
    delay: '3000',
    wait_for_event: 'networkidle',
    retina: 'true',
  })

  if (mobile && mobile.length > 50000) {
    console.log(`[Screenshot] Captured ${url} → ${(mobile.length / 1024).toFixed(0)}KB (mobile 390×844 @2x)`)
    return mobile
  }

  console.log(`[Screenshot] Mobile also too small (${mobile?.length || 0}B), retrying with no blocking...`)

  // Last attempt: no blocking (some sites need cookie banners to render)
  const noBlock = await takeScreenshotAPI(token, url, {
    width: '1440',
    height: '900',
    delay: '3000',
    wait_for_event: 'networkidle',
    no_cookie_banners: 'false',
    block_ads: 'false',
    block_chat_widgets: 'false',
  })

  if (noBlock && noBlock.length > 10000) {
    console.log(`[Screenshot] Captured ${url} → ${(noBlock.length / 1024).toFixed(0)}KB (no-block fallback)`)
    return noBlock
  }

  console.log(`[Screenshot] All attempts failed for ${url}`)
  return desktop || mobile || noBlock
}

// ─── ScreenshotAPI.net ──────────────────────────────────────

async function takeScreenshotAPI(
  token: string,
  url: string,
  overrides: Record<string, string>,
): Promise<Buffer | null> {
  try {
    const params = new URLSearchParams({
      token,
      url,
      output: 'image',
      file_type: 'png',
      full_page: 'false',
      no_cookie_banners: 'true',
      block_ads: 'true',
      block_chat_widgets: 'true',
      block_tracking: 'true',
      lazy_load: 'true',
      fresh: 'true',
      ...overrides,
    })

    const apiUrl = `https://shot.screenshotapi.net/v3/screenshot?${params.toString()}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)

    const res = await fetch(apiUrl, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) {
      console.log(`[Screenshot] API returned ${res.status}`)
      return null
    }

    // Check content-type — if JSON, it's an error response
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const json = await res.json()
      console.log(`[Screenshot] API error: ${json.error || json.message || JSON.stringify(json).substring(0, 200)}`)
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

// ─── ScreenshotOne (legacy fallback) ────────────────────────

async function captureWithScreenshotOne(accessKey: string, url: string): Promise<Buffer | null> {
  // Desktop
  const desktop = await takeScreenshotOne(accessKey, url, {
    viewport_width: '1440',
    viewport_height: '900',
    delay: '5',
  })

  if (desktop && desktop.length > 50000) {
    console.log(`[Screenshot] Captured ${url} → ${(desktop.length / 1024).toFixed(0)}KB (desktop 1440×900)`)
    return desktop
  }

  // Mobile
  const mobile = await takeScreenshotOne(accessKey, url, {
    viewport_width: '390',
    viewport_height: '844',
    delay: '7',
    device_scale_factor: '2',
  })

  if (mobile && mobile.length > 50000) {
    console.log(`[Screenshot] Captured ${url} → ${(mobile.length / 1024).toFixed(0)}KB (mobile)`)
    return mobile
  }

  // No-block
  const noBlock = await takeScreenshotOne(accessKey, url, {
    viewport_width: '1440',
    viewport_height: '900',
    delay: '8',
    block_cookie_banners: 'false',
    block_chats: 'false',
    block_ads: 'false',
  })

  if (noBlock && noBlock.length > 10000) {
    console.log(`[Screenshot] Captured ${url} → ${(noBlock.length / 1024).toFixed(0)}KB (no-block)`)
    return noBlock
  }

  console.log(`[Screenshot] All attempts failed for ${url}`)
  return desktop || mobile || noBlock
}

async function takeScreenshotOne(
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
    const timeout = setTimeout(() => controller.abort(), 45000)

    const res = await fetch(apiUrl, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return null

    const buffer = Buffer.from(await res.arrayBuffer())
    return buffer.length >= 1000 ? buffer : null
  } catch {
    return null
  }
}

/** @deprecated Use captureWebsite instead */
export const captureHeader = captureWebsite
