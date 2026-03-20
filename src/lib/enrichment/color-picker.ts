/**
 * AI Brand Color Picker — Claude Haiku Vision
 *
 * Sends website screenshot + logo as TWO separate images to Haiku.
 * AI picks background + label colors directly from the brand identity.
 * Post-processing only does accessibility adjustments.
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

    console.log(`[AI Colors] Sending to Haiku: screenshot=${(screenshotResized.length / 1024).toFixed(0)}KB logo=${(logoThumbnail.length / 1024).toFixed(0)}KB`)

    const prompt = [
      'Du siehst den Screenshot einer Website und das Logo eines Unternehmens.',
      '',
      'Bestimme 2 Farben für eine Apple Wallet Treuekarte:',
      '',
      '1. BACKGROUND: Eine dunkle Farbe die zur Marke passt.',
      '   - Das Logo wird darauf angezeigt und muss gut sichtbar sein.',
      '   - Idealerweise eine dunklere Version der Hauptmarkenfarbe.',
      '   - Luminanz zwischen 0.05 und 0.40 (nicht zu dunkel, nicht zu hell).',
      '',
      '2. LABEL: Eine saturierte Akzentfarbe die auf dem Background auffällt.',
      '   - Nimm eine echte Farbe die auf der Website vorkommt (Buttons, Akzente, Highlights).',
      '   - KEIN Grau, Weiß, Schwarz oder Creme — muss farbig sein.',
      '   - Muss auf dem Background lesbar sein (guter Kontrast).',
      '',
      'Schau dir die Website GENAU an. Welche Farben definieren diese Marke?',
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
    // Fix 5: Accept flexible keys (bg/background, accent/label)
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

function isValidHex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s)
}
