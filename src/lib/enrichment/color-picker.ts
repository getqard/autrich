/**
 * AI Brand Color Picker — Gemini Flash Vision
 *
 * Sends website screenshot + logo as TWO images to Gemini Flash.
 * AI picks background + label colors directly from the brand identity.
 * Post-processing only does accessibility adjustments.
 *
 * Cost: ~$0.0001-0.0002 per call (10x cheaper than Claude Haiku Vision)
 */

import sharp from 'sharp'
import { geminiVision, extractJson } from '@/lib/ai/gemini'
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
 * Use Gemini Flash Vision to pick brand colors for a Wallet Pass.
 *
 * Sends two images: website screenshot + logo thumbnail.
 * Returns null if no API key, no screenshot, API error, or post-validation fails.
 */
export async function pickBrandColors(
  logoBuffer: Buffer,
  websiteScreenshot: Buffer | null,
): Promise<AIColorResult | null> {
  if (!process.env.GEMINI_API_KEY) {
    console.log('[AI Colors] No GEMINI_API_KEY, skipping')
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

    console.log(`[AI Colors] Sending to Gemini Flash: screenshot=${(screenshotResized.length / 1024).toFixed(0)}KB logo=${(logoThumbnail.length / 1024).toFixed(0)}KB`)

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

    const result = await geminiVision(
      [
        { buffer: screenshotResized },
        { buffer: logoThumbnail },
      ],
      prompt,
      { maxTokens: 100, temperature: 0.2 }
    )

    const jsonStr = extractJson(result.text)
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>

    // Accept flexible keys (bg/background, accent/label)
    const rawBg = typeof parsed.background === 'string' ? parsed.background
      : typeof parsed.bg === 'string' ? parsed.bg
      : null
    const rawLabel = typeof parsed.label === 'string' ? parsed.label
      : typeof parsed.accent === 'string' ? parsed.accent
      : null
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0

    console.log(`[AI Colors] Gemini raw: bg=${rawBg} label=${rawLabel} confidence=${confidence}`)

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
    console.error('[AI Colors] Gemini failed (non-fatal):', err instanceof Error ? err.message : err)
    return null
  }
}

function isValidHex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s)
}
