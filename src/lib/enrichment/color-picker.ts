/**
 * AI Brand Color Picker — Claude Haiku Vision
 *
 * Sends website screenshot + logo as TWO separate images to Haiku.
 * AI picks background + label colors directly from the brand identity.
 * Post-processing does accessibility adjustments + logo visibility check.
 *
 * Cost: ~$0.001-0.002 per call (2 images + short text, Haiku)
 */

import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { hexLuminance, wcagContrastRatio, colorSaturation, hexToHsl, hslToHex, ensurePassSuitable } from './colors'

export type AIColorResult = {
  background: string
  label: string | null
  confidence: number
}

function validateLabel(rawLabel: string | null, bg: string, adjustments: string[]): string | null {
  if (!rawLabel || !isValidHex(rawLabel)) return null

  const label = rawLabel.toLowerCase()
  const labelSat = colorSaturation(label)
  if (labelSat < 0.15) {
    console.log(`[AI Colors] Validation: label_sat=${labelSat.toFixed(2)} ✗ (too gray) → dropping label`)
    return null
  }

  let labelWcag = wcagContrastRatio(label, bg)
  if (labelWcag >= 3.0) {
    console.log(`[AI Colors] Validation: label_wcag=${labelWcag.toFixed(1)} ✓ | label_sat=${labelSat.toFixed(2)} ✓`)
    return label
  }

  // Adjust lightness until WCAG ≥ 3.0
  const bgLumVal = hexLuminance(bg)
  const hsl = hexToHsl(label)
  const direction = bgLumVal < 0.5 ? 1 : -1

  for (let step = 0; step < 20; step++) {
    hsl.l = Math.max(0, Math.min(1, hsl.l + direction * 0.03))
    const adjusted = hslToHex(hsl.h, hsl.s, hsl.l)
    labelWcag = wcagContrastRatio(adjusted, bg)
    if (labelWcag >= 3.0) {
      adjustments.push(`label wcag=${wcagContrastRatio(label, bg).toFixed(1)} → lightened to ${adjusted} (wcag=${labelWcag.toFixed(1)})`)
      return adjusted
    }
  }

  console.log(`[AI Colors] Validation: label wcag still ${labelWcag.toFixed(1)} after adjustment → dropping`)
  return null
}

/**
 * Analyze logo to determine if it's predominantly dark or light.
 * Returns the average luminance of non-transparent, non-white pixels.
 */
async function analyzeLogoLuminance(logoBuffer: Buffer): Promise<{ avgLuminance: number; isDark: boolean; dominantHex: string }> {
  try {
    // Get raw pixel data from logo
    const { data, info } = await sharp(logoBuffer)
      .resize(64, 64, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    let totalLum = 0
    let count = 0
    let totalR = 0, totalG = 0, totalB = 0

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      // Skip transparent and near-white pixels (background)
      if (a < 128) continue
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      if (lum > 0.95) continue // skip white background
      totalLum += lum
      totalR += r
      totalG += g
      totalB += b
      count++
    }

    if (count === 0) return { avgLuminance: 0.5, isDark: false, dominantHex: '#808080' }

    const avgLum = totalLum / count
    const avgR = Math.round(totalR / count)
    const avgG = Math.round(totalG / count)
    const avgB = Math.round(totalB / count)
    const dominantHex = `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`

    console.log(`[AI Colors] Logo analysis: avgLum=${avgLum.toFixed(2)}, isDark=${avgLum < 0.4}, dominant=${dominantHex}`)

    return { avgLuminance: avgLum, isDark: avgLum < 0.4, dominantHex }
  } catch {
    return { avgLuminance: 0.5, isDark: false, dominantHex: '#808080' }
  }
}

/**
 * Use Claude Haiku Vision to pick brand colors for a Wallet Pass.
 *
 * Sends two separate images: website screenshot + logo thumbnail.
 * Returns null if no API key, no screenshot, API error, or post-validation fails.
 */
export async function pickBrandColors(
  logoBuffer: Buffer,
  websiteScreenshot: Buffer | null,
): Promise<AIColorResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[AI Colors] No ANTHROPIC_API_KEY, skipping')
    return null
  }
  if (!websiteScreenshot || websiteScreenshot.length < 1000) {
    console.log('[AI Colors] No screenshot available, skipping AI vision')
    return null
  }

  try {
    // Analyze logo BEFORE asking AI — we need to tell it about logo darkness
    const logoInfo = await analyzeLogoLuminance(logoBuffer)

    // Resize screenshot for token efficiency (~720×450)
    const screenshotResized = await sharp(websiteScreenshot)
      .resize(720, 450, { fit: 'cover' })
      .png()
      .toBuffer()

    // Resize logo to 256×256 thumbnail
    const logoThumbnail = await sharp(logoBuffer)
      .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer()

    console.log(`[AI Colors] Sending to Haiku: screenshot=${(screenshotResized.length / 1024).toFixed(0)}KB logo=${(logoThumbnail.length / 1024).toFixed(0)}KB logoDark=${logoInfo.isDark}`)

    // Build prompt with logo-awareness
    const logoGuidance = logoInfo.isDark
      ? [
          '⚠️ WICHTIG: Das Logo ist DUNKEL (dunkle Farben/Schrift).',
          '   → Der Background MUSS HELL GENUG sein damit das Logo sichtbar ist!',
          '   → Wähle einen Background mit Luminanz 0.15-0.40 (nicht zu dunkel!).',
          '   → Ein schwarzer oder sehr dunkler Background würde das Logo unsichtbar machen.',
        ].join('\n')
      : [
          'Das Logo ist hell/weiß — ein dunkler Background ist ideal.',
          '   → Wähle einen Background mit Luminanz 0.05-0.25.',
        ].join('\n')

    const prompt = [
      'Du siehst den Screenshot einer Website (Bild 1) und das Logo des Unternehmens (Bild 2).',
      '',
      'Bestimme 2 Farben für eine Apple Wallet Treuekarte:',
      '',
      '1. BACKGROUND: Eine Farbe die zur Marke passt UND auf der das Logo sichtbar ist.',
      logoGuidance,
      '',
      '2. LABEL: Eine Akzentfarbe die EXAKT auf der Website vorkommt.',
      '   - Schau dir Buttons, Links, Highlights, Überschriften an.',
      '   - Nimm die EXAKTE Farbe, keine Approximation (kein Orange wenn es Rot ist!).',
      '   - KEIN Grau, Weiß, Schwarz oder Creme — muss eine echte Brandfarbe sein.',
      '   - Muss auf dem Background lesbar sein.',
      '',
      'REGELN:',
      '- Schau dir die Website-Farben PIXEL-GENAU an. Erfinde keine Farben.',
      '- Wenn die Website Rot (#cc0000) verwendet, sag Rot, nicht Orange.',
      '- Der Background muss so gewählt sein, dass das Logo darauf SICHTBAR ist.',
      '',
      'Antworte NUR mit JSON: {"background":"#hex","label":"#hex","confidence":0.9}',
    ].join('\n')

    const client = new Anthropic()

    // 10s timeout to prevent hanging API calls
    const apiAbort = new AbortController()
    const apiTimeout = setTimeout(() => apiAbort.abort(), 10000)

    const response = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: screenshotResized.toString('base64'),
                },
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: logoThumbnail.toString('base64'),
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      },
      { signal: apiAbort.signal }
    )
    clearTimeout(apiTimeout)

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    const jsonMatch = text.match(/\{[^}]+\}/)
    if (!jsonMatch) {
      console.log(`[AI Colors] No JSON in response: ${text.substring(0, 200)}`)
      return null
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      console.log(`[AI Colors] Failed to parse JSON: ${jsonMatch[0]}`)
      return null
    }
    const rawBg = typeof parsed.background === 'string' ? parsed.background
      : typeof parsed.bg === 'string' ? parsed.bg
      : null
    const rawLabel = typeof parsed.label === 'string' ? parsed.label
      : typeof parsed.accent === 'string' ? parsed.accent
      : null
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0

    console.log(`[AI Colors] Raw response: bg=${rawBg} label=${rawLabel} confidence=${confidence}`)

    if (!rawBg || !isValidHex(rawBg)) {
      console.log(`[AI Colors] Invalid background hex: ${rawBg}`)
      return null
    }
    if (confidence < 0.5) {
      console.log(`[AI Colors] Confidence too low: ${confidence}`)
      return null
    }

    // ─── Post-Validation ──────────────────────────────────────
    const adjustments: string[] = []

    // BG: ensure luminance 0.05-0.40
    let finalBg = rawBg.toLowerCase()
    const bgLum = hexLuminance(finalBg)
    if (bgLum < 0.05 || bgLum > 0.40) {
      finalBg = ensurePassSuitable(finalBg)
      adjustments.push(`bg lum=${bgLum.toFixed(2)} out of range → adjusted to ${finalBg} (lum=${hexLuminance(finalBg).toFixed(2)})`)
    } else {
      console.log(`[AI Colors] Validation: bg_lum=${bgLum.toFixed(2)} ✓`)
    }

    // LOGO VISIBILITY CHECK: ensure logo is visible on background
    const logoOnBgContrast = estimateLogoContrast(logoInfo, finalBg)
    if (logoOnBgContrast < 2.0) {
      // Logo would be invisible → lighten or darken the background
      console.log(`[AI Colors] ⚠️ Logo contrast on bg too low (${logoOnBgContrast.toFixed(1)}) → adjusting bg`)
      const hsl = hexToHsl(finalBg)
      if (logoInfo.isDark) {
        // Dark logo needs lighter bg
        hsl.l = Math.min(0.40, Math.max(hsl.l, 0.25))
        if (hsl.s < 0.1) hsl.s = 0.15 // add some saturation if pure gray
      } else {
        // Light logo needs darker bg
        hsl.l = Math.min(hsl.l, 0.15)
      }
      const adjusted = hslToHex(hsl.h, hsl.s, hsl.l)
      const newContrast = estimateLogoContrast(logoInfo, adjusted)
      if (newContrast > logoOnBgContrast) {
        adjustments.push(`logo visibility: contrast ${logoOnBgContrast.toFixed(1)} → ${newContrast.toFixed(1)}, bg ${finalBg} → ${adjusted}`)
        finalBg = adjusted
      }
    } else {
      console.log(`[AI Colors] Logo visibility: contrast=${logoOnBgContrast.toFixed(1)} ✓`)
    }

    // Label: validate and adjust
    const finalLabel = validateLabel(rawLabel, finalBg, adjustments)

    if (adjustments.length > 0) {
      for (const adj of adjustments) {
        console.log(`[AI Colors] Adjustment: ${adj}`)
      }
    }

    console.log(`[AI Colors] Final: bg=${finalBg} label=${finalLabel} (${adjustments.length} adjustments)`)

    return {
      background: finalBg,
      label: finalLabel,
      confidence,
    }
  } catch (err) {
    console.error('[AI Colors] Failed (non-fatal):', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Estimate contrast ratio between the logo content and a background color.
 */
function estimateLogoContrast(
  logoInfo: { avgLuminance: number; dominantHex: string },
  bgHex: string,
): number {
  const bgLum = hexLuminance(bgHex)
  const logoLum = logoInfo.avgLuminance

  const lighter = Math.max(bgLum, logoLum)
  const darker = Math.min(bgLum, logoLum)

  return (lighter + 0.05) / (darker + 0.05)
}

function isValidHex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s)
}
