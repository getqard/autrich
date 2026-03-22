/**
 * Logo Contrast Check — post-color-selection validation
 *
 * After colors are chosen, checks if the logo is actually visible on the background.
 * If not:
 *   1. Scans logo candidates for a better variant (pixel analysis, $0)
 *   2. If no variant found → AI picks best logo for the background (Haiku, ~$0.001)
 *   3. If AI fails → adjusts the background color
 *
 * Filters out third-party logos (Google, Facebook, etc.)
 */

import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'

// Third-party logos that should never be picked as the business logo
const THIRD_PARTY_PATTERNS = [
  'google', 'facebook', 'instagram', 'twitter', 'tiktok', 'youtube',
  'yelp', 'tripadvisor', 'whatsapp', 'telegram', 'pinterest',
  'linkedin', 'paypal', 'stripe', 'plugin', 'widget', 'review',
  'trustpilot', 'capterra', 'g2crowd',
]

type ContrastCheckResult = {
  logoVisible: boolean
  contrastRatio: number
  newLogoBuffer?: Buffer
  newLogoSource?: string
  adjustedBg?: string
}

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
      if (a < 128) continue
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      if (lum > 0.95) continue
      totalLum += lum
      count++
    }

    return count > 0 ? totalLum / count : 0.5
  } catch {
    return 0.5
  }
}

function contrastRatio(lum1: number, lum2: number): number {
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  return (lighter + 0.05) / (darker + 0.05)
}

function hexToLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function isThirdPartyLogo(url: string): boolean {
  const lower = url.toLowerCase()
  return THIRD_PARTY_PATTERNS.some(p => lower.includes(p))
}

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('data:')) {
      const commaIdx = url.indexOf(',')
      if (commaIdx === -1 || url.length > 2 * 1024 * 1024) return null
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
 * If not:
 *   1. Scan candidates for a better variant (pixel check, $0)
 *   2. Ask AI to pick best logo for this background (~$0.001)
 *   3. Adjust background color as last resort
 */
export async function checkLogoVisibility(
  logoBuffer: Buffer,
  bgHex: string,
  logoCandidates: Array<{ url: string; score: number; source: string }>,
  currentLogoUrl: string | null,
  businessName?: string,
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

  // ─── Step 1: Pixel-based scan for better variant ($0) ────

  const alternatives = logoCandidates
    .filter(c => {
      if (c.url === currentLogoUrl) return false
      if (c.score < 40) return false
      if (isThirdPartyLogo(c.url)) return false
      const urlLower = c.url.toLowerCase()
      if (/\b(photo|dsc|img_\d|preview)\b/.test(urlLower)) return false
      if (c.url.startsWith('data:') && c.url.length < 500) return false
      return true
    })
    .sort((a, b) => {
      const aHasLogo = a.url.toLowerCase().includes('logo') ? 1 : 0
      const bHasLogo = b.url.toLowerCase().includes('logo') ? 1 : 0
      if (aHasLogo !== bHasLogo) return bHasLogo - aHasLogo
      return b.score - a.score
    })
    .slice(0, 5)

  for (const candidate of alternatives) {
    try {
      const buf = await fetchImage(candidate.url)
      if (!buf) continue

      try {
        const meta = await sharp(buf).metadata()
        if (meta.width && meta.height) {
          const aspect = meta.width / meta.height
          if (aspect > 2.5 || aspect < 0.3) continue
        }
      } catch { /* skip metadata check */ }

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

  // ─── Step 2: AI picks best logo for this background ──────

  console.log(`[Logo Contrast] No pixel-based match → asking AI to pick best logo...`)

  const aiResult = await aiPickLogoForBackground(
    logoCandidates.filter(c => !isThirdPartyLogo(c.url) && c.score >= 40),
    bgHex,
    businessName,
  )

  if (aiResult) {
    const aiRatio = contrastRatio(await getLogoLuminance(aiResult.buffer), bgLum)
    if (aiRatio > ratio) {
      console.log(`[Logo Contrast] ✓ AI picked better logo: ${aiResult.source} (ratio ${aiRatio.toFixed(1)})`)
      return {
        logoVisible: aiRatio >= minContrast,
        contrastRatio: aiRatio,
        newLogoBuffer: aiResult.buffer,
        newLogoSource: aiResult.source,
      }
    }
  }

  // ─── Step 3: Adjust background ────────────────────────────

  console.log(`[Logo Contrast] No better logo found → adjusting background`)

  const h = bgHex.replace('#', '')
  let r = parseInt(h.substring(0, 2), 16)
  let g = parseInt(h.substring(2, 4), 16)
  let b = parseInt(h.substring(4, 6), 16)

  if (logoLum < 0.3) {
    const factor = 1.8
    r = Math.min(255, Math.round(r * factor + 30))
    g = Math.min(255, Math.round(g * factor + 30))
    b = Math.min(255, Math.round(b * factor + 30))
  } else {
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

// ─── AI Logo Picker for Background ──────────────────────────

async function aiPickLogoForBackground(
  candidates: Array<{ url: string; score: number; source: string }>,
  bgHex: string,
  businessName?: string,
): Promise<{ buffer: Buffer; source: string } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (candidates.length < 2) return null

  const top = candidates.slice(0, 5)

  // Download + resize thumbnails
  const thumbnails = await Promise.all(
    top.map(async (c, i) => {
      try {
        const buf = await fetchImage(c.url)
        if (!buf) return null
        const thumb = await sharp(buf)
          .resize(128, 128, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .png()
          .toBuffer()
        return { index: i, buffer: buf, thumb }
      } catch {
        return null
      }
    })
  )

  const valid = thumbnails.filter((t): t is { index: number; buffer: Buffer; thumb: Buffer } => t !== null)
  if (valid.length < 2) return null

  // Build vision message
  const contentBlocks: Anthropic.ContentBlockParam[] = []
  for (let i = 0; i < valid.length; i++) {
    contentBlocks.push({ type: 'text', text: `Logo ${i + 1}:` })
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: valid[i].thumb.toString('base64') },
    })
  }

  const bgIsDark = hexToLuminance(bgHex) < 0.2
  contentBlocks.push({
    type: 'text',
    text: [
      businessName ? `Unternehmen: "${businessName}"` : '',
      `Der Pass-Hintergrund ist ${bgIsDark ? 'DUNKEL' : 'HELL'} (${bgHex}).`,
      `Welches Logo (1-${valid.length}) ist das echte Logo des Unternehmens UND wäre auf dem ${bgIsDark ? 'dunklen' : 'hellen'} Hintergrund am besten SICHTBAR?`,
      '',
      'Regeln:',
      '- Wähle das echte Unternehmens-Logo, NICHT Google/Facebook/Social Media Icons',
      bgIsDark ? '- Bevorzuge HELLE Logo-Varianten (weiß, hell) für den dunklen Hintergrund' : '- Bevorzuge DUNKLE Logo-Varianten für den hellen Hintergrund',
      '- Wenn keins passt: {"pick": 0}',
      '',
      'Antworte NUR mit JSON: {"pick": 2, "confidence": 0.9}',
    ].filter(Boolean).join('\n'),
  })

  try {
    const client = new Anthropic()
    const apiAbort = new AbortController()
    const apiTimeout = setTimeout(() => apiAbort.abort(), 10000)

    const response = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{ role: 'user', content: contentBlocks }],
      },
      { signal: apiAbort.signal }
    )
    clearTimeout(apiTimeout)

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    const jsonMatch = text.match(/\{[^}]+\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    const pick = typeof parsed.pick === 'number' ? parsed.pick : 0
    if (pick < 1 || pick > valid.length) return null

    const chosen = valid[pick - 1]
    const source = top[chosen.index].source

    console.log(`[Logo Contrast AI] Haiku picked logo ${pick}: ${source} (${top[chosen.index].url.substring(0, 60)}...)`)

    return { buffer: chosen.buffer, source }
  } catch (err) {
    console.error('[Logo Contrast AI] Failed (non-fatal):', err instanceof Error ? err.message : err)
    return null
  }
}
