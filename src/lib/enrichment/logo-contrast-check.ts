/**
 * Logo Contrast Check — post-color-selection validation
 *
 * After colors are chosen, checks if the logo is actually visible on the background.
 * If not, tries to find an alternative logo variant (light/dark) from candidates.
 * If no alternative, adjusts the background color.
 *
 * Zero AI cost — pure pixel analysis with Sharp.
 */

import sharp from 'sharp'

type ContrastCheckResult = {
  /** Whether the current logo is visible on the bg */
  logoVisible: boolean
  /** Contrast ratio between logo content and bg (1 = identical, 21 = max) */
  contrastRatio: number
  /** If a better logo variant was found: the new logo buffer */
  newLogoBuffer?: Buffer
  /** Source of the new logo (e.g. "header-logo-light") */
  newLogoSource?: string
  /** If bg was adjusted to improve visibility */
  adjustedBg?: string
}

/**
 * Analyze the average luminance of a logo image (non-transparent, non-white pixels).
 */
async function getLogoLuminance(buffer: Buffer): Promise<number> {
  try {
    const { data } = await sharp(buffer)
      .resize(64, 64, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    let totalLum = 0
    let count = 0

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 128) continue // skip transparent
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      if (lum > 0.95) continue // skip white background
      totalLum += lum
      count++
    }

    return count > 0 ? totalLum / count : 0.5
  } catch {
    return 0.5
  }
}

/**
 * Calculate contrast ratio between two luminance values (WCAG formula).
 */
function contrastRatio(lum1: number, lum2: number): number {
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Get luminance from a hex color.
 */
function hexToLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255

  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * Fetch an image buffer from URL with timeout.
 */
async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('data:')) {
      const commaIdx = url.indexOf(',')
      if (commaIdx === -1) return null
      if (url.length > 2 * 1024 * 1024) return null
      const header = url.substring(0, commaIdx).toLowerCase()
      const data = url.substring(commaIdx + 1)
      return header.includes('base64')
        ? Buffer.from(data, 'base64')
        : Buffer.from(decodeURIComponent(data))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
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
 * Check if the current logo is visible on the chosen background.
 * If not, scan logo candidates for a better variant.
 * If no better variant exists, suggest a bg adjustment.
 *
 * @param logoBuffer - Current logo image
 * @param bgHex - Chosen background color
 * @param logoCandidates - All available logo candidates (URL + score)
 * @param currentLogoUrl - URL of the currently selected logo (to skip in scan)
 * @param minContrast - Minimum acceptable contrast ratio (default 2.0)
 */
export async function checkLogoVisibility(
  logoBuffer: Buffer,
  bgHex: string,
  logoCandidates: Array<{ url: string; score: number; source: string }>,
  currentLogoUrl: string | null,
  minContrast: number = 2.0,
): Promise<ContrastCheckResult> {
  const bgLum = hexToLuminance(bgHex)
  const logoLum = await getLogoLuminance(logoBuffer)
  const ratio = contrastRatio(logoLum, bgLum)

  console.log(`[Logo Contrast] Logo lum=${logoLum.toFixed(2)}, bg lum=${bgLum.toFixed(2)}, ratio=${ratio.toFixed(1)} (min=${minContrast})`)

  if (ratio >= minContrast) {
    console.log(`[Logo Contrast] ✓ Logo is visible (ratio ${ratio.toFixed(1)} ≥ ${minContrast})`)
    return { logoVisible: true, contrastRatio: ratio }
  }

  console.log(`[Logo Contrast] ✗ Logo NOT visible (ratio ${ratio.toFixed(1)} < ${minContrast}) → scanning alternatives...`)

  // ─── Try alternative logo candidates ────────────────────

  // Sort by score descending, skip current logo
  const alternatives = logoCandidates
    .filter(c => c.url !== currentLogoUrl && c.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5) // check top 5 alternatives

  for (const candidate of alternatives) {
    try {
      const buf = await fetchImage(candidate.url)
      if (!buf) continue

      const altLum = await getLogoLuminance(buf)
      const altRatio = contrastRatio(altLum, bgLum)

      console.log(`[Logo Contrast] Trying ${candidate.source} (score=${candidate.score}): lum=${altLum.toFixed(2)}, ratio=${altRatio.toFixed(1)}`)

      if (altRatio >= minContrast && altRatio > ratio) {
        console.log(`[Logo Contrast] ✓ Found better variant: ${candidate.source} (ratio ${altRatio.toFixed(1)})`)
        return {
          logoVisible: true,
          contrastRatio: altRatio,
          newLogoBuffer: buf,
          newLogoSource: candidate.source,
        }
      }
    } catch {
      continue
    }
  }

  // ─── No better variant — adjust background ─────────────

  console.log(`[Logo Contrast] No better logo variant found → adjusting background`)

  // If logo is dark → lighten bg. If logo is light → darken bg.
  const h = bgHex.replace('#', '')
  let r = parseInt(h.substring(0, 2), 16)
  let g = parseInt(h.substring(2, 4), 16)
  let b = parseInt(h.substring(4, 6), 16)

  if (logoLum < 0.3) {
    // Dark logo → lighten bg (but keep it brand-related by scaling, not adding white)
    const factor = 1.8
    r = Math.min(255, Math.round(r * factor + 30))
    g = Math.min(255, Math.round(g * factor + 30))
    b = Math.min(255, Math.round(b * factor + 30))
  } else {
    // Light logo → darken bg
    const factor = 0.4
    r = Math.round(r * factor)
    g = Math.round(g * factor)
    b = Math.round(b * factor)
  }

  const adjustedBg = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  const newRatio = contrastRatio(logoLum, hexToLuminance(adjustedBg))

  console.log(`[Logo Contrast] BG adjusted: ${bgHex} → ${adjustedBg} (new ratio=${newRatio.toFixed(1)})`)

  return {
    logoVisible: newRatio >= minContrast,
    contrastRatio: newRatio,
    adjustedBg,
  }
}
