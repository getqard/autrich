/**
 * AI Brand Color Picker — Gemini 3 Flash Vision
 *
 * Sends website screenshot + logo + CSS color list to Gemini 3 Flash.
 * AI picks background + label from REAL website colors (CSS as ground truth).
 * Post-processing: accessibility adjustments + logo visibility check.
 *
 * Cost: ~$0.0005 per call ($0.50/$3.00 per MTok, 2 images + short text)
 */

import sharp from 'sharp'
import type { ColorCandidate } from './types'
import { hexLuminance, wcagContrastRatio, colorSaturation, hexToHsl, hslToHex, ensurePassSuitable } from './colors'

export type AIColorResult = {
  background: string
  label: string | null
  confidence: number
}

const GEMINI_VISION_MODEL = 'gemini-3-flash-preview'

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

  const bgLumVal = hexLuminance(bg)
  const hsl = hexToHsl(label)
  const direction = bgLumVal < 0.5 ? 1 : -1

  for (let step = 0; step < 20; step++) {
    hsl.l = Math.max(0, Math.min(1, hsl.l + direction * 0.03))
    const adjusted = hslToHex(hsl.h, hsl.s, hsl.l)
    labelWcag = wcagContrastRatio(adjusted, bg)
    if (labelWcag >= 3.0) {
      adjustments.push(`label wcag=${wcagContrastRatio(label, bg).toFixed(1)} → adjusted to ${adjusted} (wcag=${labelWcag.toFixed(1)})`)
      return adjusted
    }
  }

  console.log(`[AI Colors] Validation: label wcag still ${labelWcag.toFixed(1)} after adjustment → dropping`)
  return null
}

/**
 * Analyze logo to determine if it's predominantly dark or light.
 */
async function analyzeLogoLuminance(logoBuffer: Buffer): Promise<{ avgLuminance: number; isDark: boolean; dominantHex: string }> {
  try {
    const { data } = await sharp(logoBuffer)
      .resize(64, 64, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    let totalLum = 0
    let count = 0
    let totalR = 0, totalG = 0, totalB = 0

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 128) continue
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      if (lum > 0.95) continue
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
 * Use Gemini 3 Flash Vision to pick brand colors for a Wallet Pass.
 *
 * Key improvement: CSS colors from the website are passed as ground truth,
 * so the AI picks from REAL colors instead of hallucinating.
 */
export async function pickBrandColors(
  logoBuffer: Buffer,
  websiteScreenshot: Buffer | null,
  cssCandidates?: ColorCandidate[],
): Promise<AIColorResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.log('[AI Colors] No GEMINI_API_KEY, skipping')
    return null
  }
  if (!websiteScreenshot || websiteScreenshot.length < 1000) {
    console.log('[AI Colors] No screenshot available, skipping AI vision')
    return null
  }

  try {
    const logoInfo = await analyzeLogoLuminance(logoBuffer)

    const screenshotResized = await sharp(websiteScreenshot)
      .resize(720, 450, { fit: 'cover' })
      .png()
      .toBuffer()

    const logoThumbnail = await sharp(logoBuffer)
      .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer()

    console.log(`[AI Colors] Sending to Gemini 3 Flash: screenshot=${(screenshotResized.length / 1024).toFixed(0)}KB logo=${(logoThumbnail.length / 1024).toFixed(0)}KB logoDark=${logoInfo.isDark} cssCandidates=${cssCandidates?.length || 0}`)

    // Build CSS color list for ground truth
    let cssColorList = ''
    if (cssCandidates && cssCandidates.length > 0) {
      const uniqueColors = [...new Set(cssCandidates.map(c => c.hex.toLowerCase()))]
      const colorDescriptions = uniqueColors.slice(0, 15).map(hex => {
        const c = cssCandidates.find(cc => cc.hex.toLowerCase() === hex)!
        return `  ${hex} (${c.role}, ${c.source}, confidence=${c.confidence.toFixed(2)})`
      })
      cssColorList = [
        '',
        'ECHTE CSS-FARBEN der Website (Ground Truth):',
        ...colorDescriptions,
        '',
        'WICHTIG: Wähle die Label-Farbe AUS dieser Liste! Erfinde keine Farben.',
      ].join('\n')
    }

    const logoGuidance = logoInfo.isDark
      ? [
          '⚠️ Das Logo ist DUNKEL.',
          '→ Background MUSS einen guten Kontrast zum dunklen Logo haben.',
          '→ Wähle eine Farbe mit Luminanz 0.15-0.40, NICHT schwarz/sehr dunkel.',
        ].join('\n')
      : [
          'Das Logo ist hell/weiß — ein dunkler Background (Luminanz 0.05-0.25) ist ideal.',
        ].join('\n')

    const prompt = [
      'Bild 1: Website-Screenshot. Bild 2: Logo des Unternehmens.',
      '',
      'Bestimme 2 Farben für eine Apple Wallet Treuekarte:',
      '',
      '1. BACKGROUND: Die Hauptfarbe der Marke, angepasst an das Logo.',
      logoGuidance,
      '',
      '2. LABEL: Eine farbige Akzentfarbe die EXAKT auf der Website vorkommt.',
      '   - Buttons, Links, Highlights, Banner — welche Farbe sticht heraus?',
      '   - Nimm die EXAKTE Hex-Farbe, keine Approximation.',
      '   - KEIN Grau, Weiß, Schwarz — muss eine echte Brandfarbe sein.',
      cssColorList,
      '',
      'Antworte NUR mit JSON: {"background":"#hex","label":"#hex","confidence":0.9}',
    ].join('\n')

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent?key=${apiKey}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: screenshotResized.toString('base64') } },
            { inlineData: { mimeType: 'image/png', data: logoThumbnail.toString('base64') } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.2,
        },
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`Gemini API error ${res.status}: ${errorText.substring(0, 200)}`)
    }

    const response = await res.json()
    const text = response.candidates?.[0]?.content?.parts
      ?.map((p: { text: string }) => p.text)
      .join('') || ''

    // Extract JSON
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

    let finalBg = rawBg.toLowerCase()
    const bgLum = hexLuminance(finalBg)
    if (bgLum < 0.05 || bgLum > 0.40) {
      finalBg = ensurePassSuitable(finalBg)
      adjustments.push(`bg lum=${bgLum.toFixed(2)} out of range → adjusted to ${finalBg} (lum=${hexLuminance(finalBg).toFixed(2)})`)
    } else {
      console.log(`[AI Colors] Validation: bg_lum=${bgLum.toFixed(2)} ✓`)
    }

    // Logo visibility check
    const logoOnBgContrast = estimateLogoContrast(logoInfo, finalBg)
    if (logoOnBgContrast < 2.0) {
      console.log(`[AI Colors] ⚠️ Logo contrast on bg too low (${logoOnBgContrast.toFixed(1)}) → adjusting bg`)
      const hsl = hexToHsl(finalBg)
      if (logoInfo.isDark) {
        hsl.l = Math.min(0.40, Math.max(hsl.l, 0.25))
        if (hsl.s < 0.1) hsl.s = 0.15
      } else {
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

function estimateLogoContrast(
  logoInfo: { avgLuminance: number },
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
