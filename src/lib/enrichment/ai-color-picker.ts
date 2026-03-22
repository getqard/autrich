/**
 * Text-AI Color Picker — Gemini Flash-Lite
 *
 * Picks brand colors from a structured TEXT list of CSS candidates.
 * No image/screenshot needed — works with CSS data alone.
 *
 * Cost: ~$0.00007 per call (text-only, ~300 tokens)
 * vs Vision AI: ~$0.003-0.005 per call (2 images + text)
 *
 * Key advantage: AI can ONLY pick from real website colors → no hallucination.
 */

import { geminiText, extractJson } from '@/lib/ai/gemini'
import type { ColorCandidate } from './types'
import { hexLuminance, wcagContrastRatio, colorSaturation, ensurePassSuitable, hexToHsl, hslToHex } from './colors'

export type TextAIColorResult = {
  backgroundColor: string
  labelColor: string | null
  confidence: number
  reasoning: string
  costUsd: number
  tokensIn: number
  tokensOut: number
}

/**
 * Pick brand colors from CSS candidates using text-only AI.
 * Returns null if not enough candidates, API fails, or AI hallucinates.
 */
export async function pickColorsFromCSS(
  candidates: ColorCandidate[],
  logoColor: { hex: string; luminance: number; saturation: number } | null,
  websiteTitle: string | null,
  industrySlug: string | null,
): Promise<TextAIColorResult | null> {
  // Gate: need at least 3 non-boring candidates
  const usable = candidates.filter(c => {
    const sat = colorSaturation(c.hex)
    const lum = hexLuminance(c.hex)
    return !isBoringForAI(c.hex) || sat > 0.15 || (lum > 0.02 && lum < 0.95)
  })

  if (usable.length < 3) {
    console.log(`[Text-AI Colors] Only ${usable.length} usable candidates, skipping`)
    return null
  }

  // Deduplicate by hex, keep highest confidence
  const byHex = new Map<string, ColorCandidate>()
  for (const c of usable) {
    const key = c.hex.toLowerCase()
    const existing = byHex.get(key)
    if (!existing || c.confidence > existing.confidence) {
      byHex.set(key, c)
    }
  }
  const uniqueCandidates = Array.from(byHex.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20) // max 20 to keep prompt short

  // Build the color list with context
  const colorLines = uniqueCandidates.map(c => {
    const sat = colorSaturation(c.hex)
    const lum = hexLuminance(c.hex)
    const satLabel = sat > 0.6 ? 'stark gesättigt' : sat > 0.3 ? 'gesättigt' : sat > 0.1 ? 'leicht gesättigt' : 'entsättigt'
    const lumLabel = lum < 0.1 ? 'sehr dunkel' : lum < 0.3 ? 'dunkel' : lum < 0.6 ? 'mittel' : lum < 0.85 ? 'hell' : 'sehr hell'
    const ctx = c.context || c.source
    return `  ${c.hex} | ${c.role} | ${satLabel}, ${lumLabel} | conf=${c.confidence.toFixed(2)} | "${ctx}"`
  }).join('\n')

  const logoInfo = logoColor
    ? `Logo-Farbe: ${logoColor.hex} (Luminanz ${logoColor.luminance.toFixed(2)}, ${logoColor.luminance < 0.4 ? 'DUNKEL — Background muss genug Kontrast haben' : 'HELL — dunkler Background ideal'})`
    : 'Logo-Farbe: unbekannt'

  const prompt = [
    websiteTitle ? `Website: ${websiteTitle}` : '',
    industrySlug ? `Branche: ${industrySlug}` : '',
    logoInfo,
    '',
    `${uniqueCandidates.length} CSS-Farben gefunden:`,
    colorLines,
    '',
    'Wähle 2 Farben für eine Apple Wallet Treuekarte:',
    '',
    '1. BACKGROUND: Dunkle Markenfarbe (Luminanz 0.05-0.40).',
    '   - Muss zur Marke passen (Header-Farben, Brand-Variablen bevorzugen)',
    '   - Logo muss darauf sichtbar sein',
    '',
    '2. LABEL: Farbige Akzentfarbe die auf dem Background auffällt.',
    '   - Button-Farben, Link-Farben, Heading-Farben bevorzugen',
    '   - Gesättigt, kein Grau/Schwarz/Weiß',
    '   - Guter Kontrast zum Background',
    '',
    'REGELN:',
    '- Wähle NUR Hex-Farben aus der obigen Liste',
    '- Bevorzuge Farben mit hoher Confidence und Brand-Kontext',
    '- Wenn keine passende dunkle Farbe existiert, nimm die dunkelste verfügbare',
    '',
    'Antworte NUR mit JSON: {"bg":"#hex","label":"#hex","confidence":0.9,"reason":"kurze Begründung"}',
  ].filter(Boolean).join('\n')

  try {
    const result = await geminiText(
      'Du wählst Markenfarben für eine Apple Wallet Treuekarte aus einer Liste von CSS-Farben einer Website. Antworte nur mit JSON.',
      prompt,
      { maxTokens: 100, temperature: 0.2 }
    )

    const jsonStr = extractJson(result.text)
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>

    const rawBg = (parsed.bg as string || parsed.background as string || '').toLowerCase()
    const rawLabel = (parsed.label as string || parsed.accent as string || '').toLowerCase()
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.7
    const reasoning = (parsed.reason as string) || ''

    console.log(`[Text-AI Colors] Raw: bg=${rawBg} label=${rawLabel} conf=${confidence} reason="${reasoning}"`)

    // Hallucination guard: verify colors exist in candidates
    const allHexes = new Set(uniqueCandidates.map(c => c.hex.toLowerCase()))

    if (!rawBg || !isValidHex(rawBg)) {
      console.log(`[Text-AI Colors] Invalid bg hex: ${rawBg}`)
      return null
    }

    // Allow AI to pick a color that's close to one in the list (within darkening range)
    let finalBg = rawBg
    if (!allHexes.has(rawBg)) {
      // Check if it's a darkened version of a candidate
      const closestCandidate = findClosestCandidate(rawBg, uniqueCandidates)
      if (closestCandidate) {
        console.log(`[Text-AI Colors] bg ${rawBg} not in list, using closest: ${closestCandidate}`)
        finalBg = closestCandidate
      } else {
        console.log(`[Text-AI Colors] bg ${rawBg} not in candidates list → rejected`)
        return null
      }
    }

    // Ensure bg luminance is in range
    const bgLum = hexLuminance(finalBg)
    if (bgLum < 0.05 || bgLum > 0.40) {
      finalBg = ensurePassSuitable(finalBg)
      console.log(`[Text-AI Colors] bg lum ${bgLum.toFixed(2)} out of range → adjusted to ${finalBg}`)
    }

    // Validate label
    let finalLabel: string | null = null
    if (rawLabel && isValidHex(rawLabel)) {
      if (allHexes.has(rawLabel) || findClosestCandidate(rawLabel, uniqueCandidates)) {
        const sat = colorSaturation(rawLabel)
        const wcag = wcagContrastRatio(rawLabel, finalBg)
        if (sat >= 0.15 && wcag >= 2.5) {
          finalLabel = rawLabel
          // Adjust for WCAG if needed
          if (wcag < 3.0) {
            const hsl = hexToHsl(finalLabel)
            const bgLumVal = hexLuminance(finalBg)
            const dir = bgLumVal < 0.5 ? 1 : -1
            for (let i = 0; i < 15; i++) {
              hsl.l = Math.max(0, Math.min(1, hsl.l + dir * 0.03))
              const adjusted = hslToHex(hsl.h, hsl.s, hsl.l)
              if (wcagContrastRatio(adjusted, finalBg) >= 3.0) {
                finalLabel = adjusted
                break
              }
            }
          }
        }
      }
    }

    console.log(`[Text-AI Colors] Final: bg=${finalBg} label=${finalLabel} (${result.tokensIn}+${result.tokensOut} tokens, $${result.costUsd.toFixed(5)})`)

    return {
      backgroundColor: finalBg,
      labelColor: finalLabel,
      confidence,
      reasoning,
      costUsd: result.costUsd,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    }
  } catch (err) {
    console.error('[Text-AI Colors] Failed (non-fatal):', err instanceof Error ? err.message : err)
    return null
  }
}

function isValidHex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s)
}

function isBoringForAI(hex: string): boolean {
  const lum = hexLuminance(hex)
  const sat = colorSaturation(hex)
  return (lum > 0.95 || lum < 0.02) && sat < 0.1
}

/**
 * Find the closest candidate to a given hex (within perceptual distance 30).
 */
function findClosestCandidate(hex: string, candidates: ColorCandidate[]): string | null {
  const hsl1 = hexToHsl(hex)

  let closest: string | null = null
  let minDist = 30 // max acceptable distance

  for (const c of candidates) {
    const hsl2 = hexToHsl(c.hex)
    // Simple HSL distance
    let hueDiff = Math.abs(hsl1.h - hsl2.h)
    if (hueDiff > 180) hueDiff = 360 - hueDiff
    const dist = (hueDiff / 360) * 40 + Math.abs(hsl1.s - hsl2.s) * 30 + Math.abs(hsl1.l - hsl2.l) * 30

    if (dist < minDist) {
      minDist = dist
      closest = c.hex.toLowerCase()
    }
  }

  return closest
}
