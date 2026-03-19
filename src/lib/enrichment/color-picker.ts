/**
 * AI Brand Color Picker — Claude Haiku Vision
 *
 * Sends a composite image (logo + header screenshot + CSS swatches) to Haiku.
 * The AI determines background, label, and accent colors from the full brand identity.
 *
 * Cost: ~$0.001-0.002 per call (1-2 images + short text, Haiku)
 */

import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import type { ColorCandidate } from './types'
import { hexLuminance, colorSaturation, perceptualDistance, hexToRgb } from './colors'

export type AIColorResult = {
  background: string
  accent: string | null
  label: string | null
  confidence: number
}

// ─── Swatch Grid Renderer ────────────────────────────────────

/**
 * Render top CSS candidates as a grid of colored squares with hex labels.
 * Output: ~500×120px PNG
 */
async function renderSwatchGrid(candidates: ColorCandidate[]): Promise<Buffer> {
  const swatches = candidates.slice(0, 10)
  const size = 50
  const gap = 5
  const labelHeight = 16
  const cols = 5
  const rows = Math.ceil(swatches.length / cols)
  const width = cols * (size + gap) - gap
  const height = rows * (size + labelHeight + gap) - gap

  // Create colored square overlays
  const composites: sharp.OverlayOptions[] = []

  for (let i = 0; i < swatches.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * (size + gap)
    const y = row * (size + labelHeight + gap)

    const rgb = hexToRgb(swatches[i].hex)

    // Colored square
    const square = await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 255 },
      },
    }).png().toBuffer()

    composites.push({ input: square, left: x, top: y })

    // Hex label as small text image using SVG
    const labelSvg = Buffer.from(`<svg width="${size}" height="${labelHeight}">
      <text x="${size / 2}" y="${labelHeight - 2}" font-family="monospace" font-size="9"
            fill="white" text-anchor="middle">${swatches[i].hex}</text>
    </svg>`)
    const labelImg = await sharp(labelSvg).png().toBuffer()
    composites.push({ input: labelImg, left: x, top: y + size })
  }

  return sharp({
    create: {
      width: Math.max(width, 1),
      height: Math.max(height, 1),
      channels: 4,
      background: { r: 30, g: 30, b: 30, alpha: 255 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer()
}

// ─── Composite Image Builder ─────────────────────────────────

/**
 * Build a composite image combining logo, swatches, and optional header screenshot.
 *
 * Layout:
 * ┌──────────────────────────────────┐
 * │  [Logo 256×256]  [Swatches Grid] │  ← ~640×256
 * ├──────────────────────────────────┤
 * │  [Header Screenshot 640×200]     │  ← only if available
 * └──────────────────────────────────┘
 */
async function composeColorInput(
  logo: Buffer,
  swatches: Buffer,
  header?: Buffer | null,
): Promise<Buffer> {
  const topWidth = 640
  const topHeight = 260

  // Resize logo to 256×256
  const logoResized = await sharp(logo)
    .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer()

  // Resize swatches to fit right side
  const swatchResized = await sharp(swatches)
    .resize(370, 250, { fit: 'contain', background: { r: 30, g: 30, b: 30, alpha: 255 } })
    .png()
    .toBuffer()

  // Compose top row: logo left, swatches right
  const composites: sharp.OverlayOptions[] = [
    { input: logoResized, left: 5, top: 2 },
    { input: swatchResized, left: 265, top: 5 },
  ]

  let totalHeight = topHeight

  // Add header screenshot if available
  let headerResized: Buffer | null = null
  if (header) {
    try {
      headerResized = await sharp(header)
        .resize(topWidth, 200, { fit: 'cover' })
        .png()
        .toBuffer()
      totalHeight += 200
    } catch {
      // header resize failed, skip
    }
  }

  // Create composite
  let result = sharp({
    create: {
      width: topWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 30, g: 30, b: 30, alpha: 255 },
    },
  }).composite(composites)

  if (headerResized) {
    // Sharp composites must all be in one call, so rebuild
    composites.push({ input: headerResized, left: 0, top: topHeight })
    result = sharp({
      create: {
        width: topWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 30, g: 30, b: 30, alpha: 255 },
      },
    }).composite(composites)
  }

  const buf = await result.png().toBuffer()
  console.log(`[AI Color Picker] Composite image: ${topWidth}x${totalHeight} (${header ? 'with' : 'without'} header screenshot)`)
  return buf
}

// ─── Main AI Picker ──────────────────────────────────────────

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
  headerScreenshot?: Buffer | null,
): Promise<AIColorResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

  try {
    // Resize logo to 256px thumbnail
    const thumbnail = await sharp(logoBuffer)
      .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer()

    // Build composite image if we have swatches or header
    let compositeImage: Buffer | null = null
    const hasSwatches = cssCandidates.length >= 2
    const hasHeader = headerScreenshot && headerScreenshot.length > 1000

    if (hasSwatches || hasHeader) {
      try {
        const swatchGrid = hasSwatches
          ? await renderSwatchGrid(cssCandidates)
          : await sharp({ create: { width: 100, height: 50, channels: 4, background: { r: 30, g: 30, b: 30, alpha: 255 } } }).png().toBuffer()

        compositeImage = await composeColorInput(
          logoBuffer,
          swatchGrid,
          hasHeader ? headerScreenshot : null,
        )
      } catch (err) {
        console.log(`[AI Color Picker] Composite build failed, falling back to logo-only: ${err instanceof Error ? err.message : err}`)
      }
    }

    // Build prompt — vision-first when we have a composite
    const contextParts: string[] = []
    if (context.title) contextParts.push(`Website-Titel: ${context.title}`)
    if (context.description) contextParts.push(`Beschreibung: ${context.description}`)
    if (context.logoContentColor) contextParts.push(`Hauptfarbe des Logos: ${context.logoContentColor} — Background MUSS sich davon unterscheiden!`)

    let prompt: string

    if (compositeImage) {
      // Vision-first prompt — AI sees everything visually
      prompt = [
        'Du siehst ein Composite-Bild eines Unternehmens:',
        '- OBEN LINKS: Das Logo des Unternehmens',
        '- OBEN RECHTS: Farben aus dem CSS der Website (als farbige Quadrate mit Hex-Labels)',
        hasHeader ? '- UNTEN: Screenshot des Website-Headers' : '',
        '',
        'Wähle 3 Farben für eine Apple Wallet Treuekarte:',
        '',
        '1. BACKGROUND: Dunkle Markenfarbe (Luminance 0.05-0.40).',
        '   Das Logo wird DARAUF angezeigt — wähle eine Farbe auf der das Logo gut sichtbar ist.',
        '',
        '2. LABEL: Farbiger Akzent der auf dem Background POP macht.',
        '   MUSS saturiert sein (kein Grau, kein Weiß, kein Creme).',
        '   Nimm eine echte Markenfarbe (Rot, Orange, Blau, Grün...).',
        '',
        '3. ACCENT: Sekundäre Markenfarbe (kann gleich wie Label sein).',
        '',
        contextParts.length > 0 ? contextParts.join('\n') : '',
        '',
        'Antworte NUR mit JSON: {"background":"#hex","label":"#hex","accent":"#hex","confidence":0.9}',
      ].filter(Boolean).join('\n')
    } else {
      // Fallback: logo-only prompt (as before, but with label field)
      if (context.themeColor) contextParts.push(`Theme-Color Meta-Tag: ${context.themeColor}`)
      if (context.headerBackground) contextParts.push(`Header-Hintergrund der Website: ${context.headerBackground} — Das Logo sitzt auf dieser Farbe!`)

      const candidateList = cssCandidates.length > 0
        ? cssCandidates
            .slice(0, 10)
            .map(c => `${c.hex} (${c.role}, ${c.source}, confidence ${c.confidence.toFixed(2)})`)
            .join('\n')
        : 'Keine CSS-Farben gefunden.'

      prompt = [
        'Du siehst das Logo eines Unternehmens und eine Liste von Farben die auf der Website gefunden wurden.',
        '',
        'Bestimme DREI Farben für einen Apple Wallet Pass:',
        '1. BACKGROUND: Dunkle Farbe auf der das Logo SICHTBAR sein muss (nicht gleiche Farbe wie Logo!)',
        '2. LABEL: Farbiger Akzent der auf dem Background POP macht (saturiert, kein Grau/Weiß)',
        '3. ACCENT: Sekundäre Brand-Farbe (kann gleich wie Label sein)',
        '',
        'Regeln:',
        '- Die Hintergrundfarbe soll eine DUNKLE Version der Hauptbrandfarbe sein',
        '- WICHTIG: Hintergrund darf NICHT die gleiche Farbe wie das Logo sein',
        '- NIEMALS reines Schwarz (#000000) oder fast-schwarz (<#202020)',
        '- NIEMALS reines Weiß oder sehr helle Farben (>= #E0E0E0)',
        '- NIEMALS neutrale Grautöne — immer eine Farbe mit Sättigung',
        '',
        contextParts.length > 0 ? contextParts.join('\n') : '',
        '',
        `CSS-Farben von der Website:\n${candidateList}`,
        '',
        'Antworte NUR mit JSON: {"background":"#hex","label":"#hex","accent":"#hex","confidence":0.9}',
      ].filter(Boolean).join('\n')
    }

    const client = new Anthropic()

    // Build message content — composite OR logo-only
    const imageContent: Anthropic.ImageBlockParam = compositeImage
      ? {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: compositeImage.toString('base64'),
          },
        }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: thumbnail.toString('base64'),
          },
        }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: [
            imageContent,
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
    const label = typeof parsed.label === 'string' ? parsed.label : null
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0

    if (!background || !isValidHex(background)) return null
    if (confidence < 0.5) return null

    // ─── Hallucination Check ─────────────────────────────────
    // AI must pick colors that actually exist on the website.
    // If a color has no CSS candidate within perceptual distance 80, it's hallucinated.
    const isGrounded = (hex: string): boolean => {
      if (cssCandidates.length === 0) return true // no candidates to check against
      return cssCandidates.some(c => perceptualDistance(hex, c.hex) < 80)
    }

    let validBg = background
    let validAccentHex = accent && isValidHex(accent) ? accent.toLowerCase() : null
    let validLabelHex = label && isValidHex(label) ? label.toLowerCase() : null

    if (!isGrounded(validBg)) {
      console.log(`[AI Color Picker] BG ${validBg} hallucinated (no CSS match within dist 80)`)
      validBg = ''
    }
    if (validAccentHex && !isGrounded(validAccentHex)) {
      console.log(`[AI Color Picker] Accent ${validAccentHex} hallucinated → dropped`)
      validAccentHex = null
    }
    if (validLabelHex && !isGrounded(validLabelHex)) {
      console.log(`[AI Color Picker] Label ${validLabelHex} hallucinated → dropped`)
      validLabelHex = null
    }

    // If all colors were hallucinated, reject entirely
    if (!validBg && !validAccentHex && !validLabelHex) {
      console.log(`[AI Color Picker] All colors hallucinated → returning null`)
      return null
    }

    // ─── Post-Validation (luminance, logo contrast) ──────────
    const bgLum = validBg ? hexLuminance(validBg) : 0
    let bgRejected = !validBg

    // Reject too dark (near-black)
    if (!bgRejected && bgLum < 0.05) {
      console.log(`[AI Color Picker] BG rejected: too dark (lum=${bgLum.toFixed(3)})`)
      bgRejected = true
    }
    // Reject too bright
    if (!bgRejected && bgLum > 0.85) {
      console.log(`[AI Color Picker] BG rejected: too bright (lum=${bgLum.toFixed(3)})`)
      bgRejected = true
    }
    // Reject if BG ≈ logo color (logo would be invisible)
    // Relax threshold when composite was used — AI sees the full website context
    // and knows the logo works on this background
    const logoDistThreshold = compositeImage ? 40 : 100
    if (!bgRejected && context.logoContentColor) {
      const dist = perceptualDistance(validBg, context.logoContentColor)
      if (dist < logoDistThreshold) {
        console.log(`[AI Color Picker] BG rejected: too close to logo color (dist=${dist.toFixed(1)} < ${logoDistThreshold})`)
        bgRejected = true
      }
    }

    if (bgRejected) {
      // BG rejected → discard label/accent too (they were chosen for this BG)
      console.log(`[AI Color Picker] BG rejected → discarding label/accent (chosen for wrong BG)`)
      return null
    }

    console.log(`[AI Color Picker] background=${validBg}, label=${validLabelHex}, accent=${validAccentHex}, confidence=${confidence}`)

    return {
      background: validBg.toLowerCase(),
      accent: validAccentHex,
      label: validLabelHex,
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
