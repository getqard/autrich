/**
 * Smart Logo Picker — Rule-based, no AI needed
 *
 * Picks the real business logo from candidates using smart rules:
 * 1. Hard-filter all third-party logos (Instagram, TikTok, Uber, etc.)
 * 2. Prefer favicon/apple-touch-icon (these ARE the business logo 99% of the time)
 * 3. Prefer URLs containing "logo" in filename
 * 4. Skip decorative SVGs, generic icons, and photos
 *
 * Cost: $0 (no AI call)
 */

// Third-party logos/icons — these are NEVER the business logo
const THIRD_PARTY_PATTERNS = [
  // Social Media
  'instagram', 'insta-', 'insta_', 'facebook', 'fb-logo', 'fb_logo',
  'twitter', 'x-logo', 'tiktok', 'tik-tok', 'youtube', 'yt-logo',
  'pinterest', 'linkedin', 'snapchat', 'whatsapp', 'telegram',
  'threads',
  // Delivery Platforms
  'lieferando', 'uber-logo', 'uber_logo', 'ubereats', 'uber-eats',
  'deliveroo', 'wolt', 'doordash', 'just-eat', 'justeat',
  'foodora', 'gorillas', 'flink', 'getir',
  // Review/Rating
  'yelp', 'tripadvisor', 'trustpilot', 'capterra', 'g2crowd',
  'google-review', 'google_review', 'bewertung',
  // Payment
  'paypal', 'stripe', 'klarna', 'visa', 'mastercard', 'amex',
  // Tech/Framework
  'plugin', 'widget', 'elementor', 'wordpress', 'wp-emoji',
]

function isThirdParty(url: string): boolean {
  const lower = url.toLowerCase()
  return THIRD_PARTY_PATTERNS.some(p => lower.includes(p))
}

// Sources that usually ARE the real logo (high trust)
function getSourceBonus(source: string, url: string): number {
  const s = source.toLowerCase()
  const u = url.toLowerCase()

  // Favicon/apple-touch-icon → almost always the real logo
  if (s === 'apple-touch-icon') return 50
  if (s === 'favicon' || u.includes('favicon')) return 40

  // URL contains "logo" → very likely the real logo
  if (u.includes('logo') && !isThirdParty(url)) return 30

  // Header logo → good but might include social icons
  if (s === 'header-logo') return 10

  // og:image → often a photo, not a logo
  if (s === 'og-image') return -20

  // Footer logos → often partner/social icons
  if (s === 'footer-logo') return -10

  // Inline SVGs → often decorative
  if (s === 'inline-svg') return -15

  return 0
}

// Check if URL looks like a photo (not a logo)
function isLikelyPhoto(url: string): boolean {
  const lower = url.toLowerCase()
  return /\b(photo|dsc|img_\d|preview|portfolio|bild|image-\d|hero|banner|slider|bg)\b/.test(lower)
}

async function fetchAsBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('data:')) {
      const commaIdx = url.indexOf(',')
      if (commaIdx === -1 || url.length > 500000) return null
      const header = url.substring(0, commaIdx).toLowerCase()
      const data = url.substring(commaIdx + 1)
      const buf = header.includes('base64')
        ? Buffer.from(data, 'base64')
        : Buffer.from(decodeURIComponent(data))
      return buf.length > 200 ? buf : null
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > 200 ? buf : null
  } catch {
    return null
  }
}

/**
 * Pick the best business logo from candidates using smart rules.
 * No AI needed — deterministic, fast, free.
 */
export async function pickBestLogo(
  candidates: Array<{ url: string; score: number; source: string }>,
  businessName: string,
): Promise<{ url: string; buffer: Buffer; source: string } | null> {
  if (!candidates.length) return null

  // Score each candidate
  const scored = candidates
    .filter(c => !isThirdParty(c.url))
    .filter(c => !isLikelyPhoto(c.url))
    .filter(c => c.score >= 25)
    .map(c => ({
      ...c,
      finalScore: c.score + getSourceBonus(c.source, c.url),
    }))
    .sort((a, b) => b.finalScore - a.finalScore)

  if (scored.length === 0) return null

  console.log(`[Logo Picker] ${scored.length} candidates after filtering (from ${candidates.length}):`)
  scored.slice(0, 5).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.source} score=${c.finalScore} (base=${c.score}, bonus=${c.finalScore - c.score}) ${c.url.substring(0, 70)}`)
  })

  // Try each in order until we get a valid buffer
  for (const candidate of scored.slice(0, 5)) {
    const buf = await fetchAsBuffer(candidate.url)
    if (buf && buf.length > 500) {
      console.log(`[Logo Picker] Selected: ${candidate.source} (score=${candidate.finalScore}) for "${businessName}"`)
      return { url: candidate.url, buffer: buf, source: candidate.source }
    }
  }

  return null
}

// Keep the old export name for backwards compat
export const aiPickBestLogo = pickBestLogo
