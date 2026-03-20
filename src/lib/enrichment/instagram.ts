/**
 * Fetch Instagram profile picture as a logo candidate.
 *
 * Strategy: Fetch the public profile page, extract the og:image meta tag
 * (which is the profile picture), download it, and remove the circular
 * background that Instagram adds.
 *
 * Uses multi-UA rotation for reliability.
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
]

export async function fetchInstagramAvatar(handle: string): Promise<Buffer | null> {
  if (!handle) return null

  // Clean handle: remove @ prefix, whitespace
  const cleanHandle = handle.replace(/^@/, '').trim()
  if (!cleanHandle || cleanHandle.length < 2) return null

  // Try each UA until one works, with delay between attempts
  for (let i = 0; i < USER_AGENTS.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 200))
    try {
      const result = await tryFetchAvatar(cleanHandle, USER_AGENTS[i])
      if (result) return result
    } catch { /* try next UA */ }
  }

  return null
}

async function tryFetchAvatar(cleanHandle: string, userAgent: string): Promise<Buffer | null> {
  try {
    // Fetch Instagram profile page
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(`https://www.instagram.com/${cleanHandle}/`, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    clearTimeout(timeout)

    if (!res.ok) return null

    const html = await res.text()

    // Extract og:image from meta tags (primary)
    // Also try twitter:image as fallback
    const ogImageMatch = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+(?:property|name)="og:image"/i)
      || html.match(/<meta\s+(?:property|name)="twitter:image"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+(?:property|name)="twitter:image"/i)

    if (!ogImageMatch?.[1]) return null

    const imageUrl = ogImageMatch[1]

    // Download the profile picture
    const imgController = new AbortController()
    const imgTimeout = setTimeout(() => imgController.abort(), 5000)

    const imgRes = await fetch(imageUrl, {
      signal: imgController.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })
    clearTimeout(imgTimeout)

    if (!imgRes.ok) return null

    const buf = Buffer.from(await imgRes.arrayBuffer())
    if (buf.length < 1000) return null // too small to be a real image

    // Remove circular background using sharp
    const { default: sharp } = await import('sharp')
    const resized = await sharp(buf)
      .resize(320, 320, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Sample corner pixels to detect background color
    // Instagram profile pics are circular — corners are the background
    const { data, info } = resized
    const w = info.width
    const corners = [
      { x: 0, y: 0 },
      { x: w - 1, y: 0 },
      { x: 0, y: w - 1 },
      { x: w - 1, y: w - 1 },
    ]

    let bgR = 0, bgG = 0, bgB = 0
    for (const c of corners) {
      const idx = (c.y * w + c.x) * 3
      bgR += data[idx]
      bgG += data[idx + 1]
      bgB += data[idx + 2]
    }
    bgR = Math.round(bgR / 4)
    bgG = Math.round(bgG / 4)
    bgB = Math.round(bgB / 4)

    // Create alpha mask: pixels similar to background become transparent
    const tolerance = 30
    const rgba = Buffer.alloc(w * w * 4)
    for (let i = 0; i < w * w; i++) {
      const r = data[i * 3]
      const g = data[i * 3 + 1]
      const b = data[i * 3 + 2]
      rgba[i * 4] = r
      rgba[i * 4 + 1] = g
      rgba[i * 4 + 2] = b

      const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)
      rgba[i * 4 + 3] = dist < tolerance ? 0 : 255
    }

    return sharp(rgba, { raw: { width: w, height: w, channels: 4 } })
      .png()
      .toBuffer()
  } catch {
    // Instagram blocks, timeouts, etc. — non-fatal
    return null
  }
}

