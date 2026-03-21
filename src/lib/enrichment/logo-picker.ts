import sharp from 'sharp'
import type { LogoCandidate } from './types'

const GEMINI_VISION_MODEL = 'gemini-3-flash-preview'

type PickResult = {
  index: number
  confidence: number
}

/**
 * Use Gemini 3 Flash Vision to pick the best logo from a list of candidates.
 * Sends top 5 candidates as 128px thumbnails → AI picks the real logo.
 *
 * Returns null if:
 * - No GEMINI_API_KEY
 * - API call fails
 * - Less than 2 candidates
 */
export async function pickBestLogo(
  candidates: LogoCandidate[],
  businessName: string
): Promise<PickResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  if (candidates.length < 2) return null

  const top = candidates.slice(0, 5)

  // Download + resize all candidates to 128px thumbnails in parallel
  const thumbnails = await Promise.all(
    top.map(async (c, i) => {
      try {
        const buffer = await fetchImageBuffer(c.url)
        if (!buffer) return null

        const thumbnail = await sharp(buffer)
          .resize(128, 128, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .png()
          .toBuffer()

        return { index: i, buffer: thumbnail }
      } catch {
        return null
      }
    })
  )

  const validThumbnails = thumbnails.filter((t): t is { index: number; buffer: Buffer } => t !== null)
  if (validThumbnails.length < 2) return null

  // Build parts for Gemini (interleaved labels + images)
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []

  for (let i = 0; i < validThumbnails.length; i++) {
    parts.push({ text: `Bild ${i + 1}:` })
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: validThumbnails[i].buffer.toString('base64'),
      },
    })
  }

  parts.push({
    text: [
      `Du siehst ${validThumbnails.length} Bilder. Eines davon ist das Hauptlogo des Unternehmens "${businessName}".`,
      `Welches Bild (1-${validThumbnails.length}) ist das Logo? Antworte NUR mit JSON: {"pick": 3, "confidence": 0.95}`,
      'Regeln:',
      '- Favicons/Icons mit wenig Detail sind NICHT das Logo (es sei denn, es gibt nichts besseres)',
      '- Hero-Bilder/Fotos sind NICHT das Logo',
      '- Das Logo ist typischerweise ein Grafikzeichen, Schriftzug oder beides',
      '- Wenn keins ein Logo ist: {"pick": 0, "confidence": 0}',
    ].join('\n'),
  })

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent?key=${apiKey}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: 50, temperature: 0.1 },
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

    const jsonMatch = text.match(/\{[^}]+\}/)
    if (!jsonMatch) return null

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      console.error('[AI Logo Picker] Failed to parse JSON:', jsonMatch[0])
      return null
    }

    const pick = typeof parsed.pick === 'number' ? parsed.pick : 0
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0

    if (pick < 1 || pick > validThumbnails.length) return null

    const thumbnailIdx = pick - 1
    const originalIdx = validThumbnails[thumbnailIdx].index

    console.log(`[AI Logo Picker] Gemini chose candidate #${originalIdx + 1} (${top[originalIdx].source}, score ${top[originalIdx].score}) with confidence ${confidence} for "${businessName}"`)

    return { index: originalIdx, confidence }
  } catch (err) {
    console.error('[AI Logo Picker] Gemini failed (non-fatal):', err instanceof Error ? err.message : err)
    return null
  }
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
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
    if (buf.length < 200) return null

    return buf
  } catch {
    return null
  }
}
