/**
 * AI Brand Color Picker — Claude Haiku Vision
 *
 * Sends the logo as a 256px thumbnail + CSS color candidates to Haiku.
 * The AI determines the best pass background + accent color from the brand identity.
 *
 * Cost: ~$0.001 per call (1 image + short text, Haiku)
 */

import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import type { ColorCandidate } from './types'
import { hexLuminance, colorSaturation, perceptualDistance } from './colors'

export type AIColorResult = {
  background: string
  accent: string | null
  confidence: number
}

/**
 * Use Claude Haiku Vision to pick brand colors for a Wallet Pass.
 *
 * Returns null if:
 * - No ANTHROPIC_API_KEY
 * - API call fails
 * - AI confidence < 0.5
 * - Post-validation rejects the result
 */
export async function pickBrandColors(
  logoBuffer: Buffer,
  context: {
    title: string | null
    description: string | null
    themeColor: string | null
    headerBackground?: string | null
    logoContentColor?: string | null
  },
  cssCandidates: ColorCandidate[],
): Promise<AIColorResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

  try {
    // Resize logo to 256px thumbnail for minimal token usage
    const thumbnail = await sharp(logoBuffer)
      .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer()

    // Format CSS candidates for the prompt
    const candidateList = cssCandidates.length > 0
      ? cssCandidates
          .slice(0, 10) // max 10 candidates
          .map(c => `${c.hex} (${c.role}, ${c.source}, confidence ${c.confidence.toFixed(2)})`)
          .join('\n')
      : 'Keine CSS-Farben gefunden.'

    const contextParts: string[] = []
    if (context.title) contextParts.push(`Website-Titel: ${context.title}`)
    if (context.description) contextParts.push(`Beschreibung: ${context.description}`)
    if (context.themeColor) contextParts.push(`Theme-Color Meta-Tag: ${context.themeColor}`)
    if (context.headerBackground) contextParts.push(`Header-Hintergrund der Website: ${context.headerBackground} — Das Logo sitzt auf dieser Farbe!`)
    if (context.logoContentColor) contextParts.push(`Hauptfarbe des Logos: ${context.logoContentColor} — Background MUSS sich davon unterscheiden!`)

    const prompt = [
      'Du siehst das Logo eines Unternehmens und eine Liste von Farben die auf der Website gefunden wurden.',
      '',
      'Bestimme ZWEI Farben für einen Apple Wallet Pass:',
      '1. BACKGROUND: Dunkle Farbe auf der das Logo SICHTBAR sein muss (nicht gleiche Farbe wie Logo!)',
      '2. ACCENT/LABEL: Zweite Brand-Farbe die mit dem Background kontrastiert (für Labels/Beschriftungen)',
      '',
      'Regeln:',
      '- Die Hintergrundfarbe soll eine DUNKLE Version der Hauptbrandfarbe sein (Wallet Passes sehen mit dunklen Farben besser aus)',
      '- Die Akzentfarbe soll eine hellere/kontrastierende Brandfarbe sein für Labels',
      '- WICHTIG: Hintergrund darf NICHT die gleiche Farbe wie das Logo sein (sonst Logo unsichtbar!)',
      '- Wenn das Logo Gold/Gelb ist → dunkles Gold (#8B6914 oder ähnlich) als Hintergrund',
      '- Wenn das Logo Rot ist → dunkles Rot (#8B1A1A oder ähnlich) als Hintergrund',
      '- Wenn das Logo Blau ist → dunkles Blau (#1A3A6B oder ähnlich) als Hintergrund',
      '- Wenn das Logo Grün ist → dunkles Grün (#1A6B3A oder ähnlich) als Hintergrund',
      '- Wenn das Logo Weiß/Hell ist → der Website-Header-Hintergrund ist ideal (das Logo sitzt dort bereits!)',
      '- NIEMALS reines Schwarz (#000000) oder fast-schwarz (<#202020) — das ist langweilig',
      '- NIEMALS reines Weiß oder sehr helle Farben (>= #E0E0E0)',
      '- NIEMALS neutrale Grautöne — immer eine Farbe mit Sättigung',
      '- Die Farbe soll zum Logo passen und die Marke repräsentieren',
      '',
      contextParts.length > 0 ? contextParts.join('\n') : '',
      '',
      `CSS-Farben von der Website:\n${candidateList}`,
      '',
      'Antworte NUR mit JSON: {"background": "#8B6914", "accent": "#D4A017", "confidence": 0.9}',
    ].filter(Boolean).join('\n')

    const client = new Anthropic()

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: thumbnail.toString('base64'),
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    const jsonMatch = text.match(/\{[^}]+\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    const background = typeof parsed.background === 'string' ? parsed.background : null
    const accent = typeof parsed.accent === 'string' ? parsed.accent : null
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0

    if (!background || !isValidHex(background)) return null
    if (confidence < 0.5) return null

    // ─── Post-Validation ───────────────────────────────────
    const bgLum = hexLuminance(background)
    const bgSat = colorSaturation(background)
    const validAccent = accent && isValidHex(accent) ? accent.toLowerCase() : null
    let bgRejected = false

    // Reject too dark (near-black)
    if (bgLum < 0.05) {
      console.log(`[AI Color Picker] BG rejected: too dark (lum=${bgLum.toFixed(3)})`)
      bgRejected = true
    }
    // Reject too bright
    if (!bgRejected && bgLum > 0.85) {
      console.log(`[AI Color Picker] BG rejected: too bright (lum=${bgLum.toFixed(3)})`)
      bgRejected = true
    }
    // Reject if BG ≈ logo color (logo would be invisible)
    if (!bgRejected && context.logoContentColor) {
      const dist = perceptualDistance(background, context.logoContentColor)
      if (dist < 100) {
        console.log(`[AI Color Picker] BG rejected: too close to logo color (dist=${dist.toFixed(1)})`)
        bgRejected = true
      }
    }

    if (bgRejected) {
      // BG is bad, but keep accent if it's good
      if (validAccent) {
        console.log(`[AI Color Picker] BG rejected but keeping accent=${validAccent}`)
        return { background: '', accent: validAccent, confidence: 0 }
      }
      return null
    }

    console.log(`[AI Color Picker] background=${background}, accent=${accent}, confidence=${confidence}`)

    return {
      background: background.toLowerCase(),
      accent: validAccent,
      confidence,
    }
  } catch (err) {
    console.error('[AI Color Picker] Failed (non-fatal):', err instanceof Error ? err.message : err)
    return null
  }
}

function isValidHex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s)
}
