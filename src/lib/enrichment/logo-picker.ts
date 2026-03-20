import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import type { LogoCandidate } from './types'

type PickResult = {
  index: number
  confidence: number
}

/**
 * Use Claude Haiku Vision to pick the best logo from a list of candidates.
 * Sends top 5 candidates as 128px thumbnails → AI picks the real logo.
 *
 * Returns null if:
 * - No ANTHROPIC_API_KEY
 * - API call fails
 * - Less than 2 candidates (no point in asking AI to choose from 1)
 */
export async function pickBestLogo(
  candidates: LogoCandidate[],
  businessName: string
): Promise<PickResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (candidates.length < 2) return null

  const top = candidates.slice(0, 5)

  // Download + resize all candidates to 128px thumbnails in parallel
  const thumbnails = await Promise.all(
    top.map(async (c, i) => {
      try {
        const buffer = await fetchImageBuffer(c.url)
        if (!buffer) return null

        // Resize to 128x128 thumbnail for minimal token usage
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

  // Build vision message with all thumbnails
  const imageContent: Anthropic.ImageBlockParam[] = validThumbnails.map((t, i) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/png' as const,
      data: t.buffer.toString('base64'),
    },
  }))

  // Interleave images with labels
  const contentBlocks: Anthropic.ContentBlockParam[] = []
  for (let i = 0; i < validThumbnails.length; i++) {
    contentBlocks.push({
      type: 'text',
      text: `Bild ${i + 1}:`,
    })
    contentBlocks.push(imageContent[i])
  }

  contentBlocks.push({
    type: 'text',
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
    const client = new Anthropic()

    // 10s timeout to prevent hanging API calls
    const apiAbort = new AbortController()
    const apiTimeout = setTimeout(() => apiAbort.abort(), 10000)

    const response = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: contentBlocks,
          },
        ],
      },
      { signal: apiAbort.signal }
    )
    clearTimeout(apiTimeout)

    // Parse response
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

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

    // Map back from 1-based label to original candidate index
    const thumbnailIdx = pick - 1
    const originalIdx = validThumbnails[thumbnailIdx].index

    console.log(`[AI Logo Picker] Chose candidate #${originalIdx + 1} (${top[originalIdx].source}, score ${top[originalIdx].score}) with confidence ${confidence} for "${businessName}"`)

    return { index: originalIdx, confidence }
  } catch (err) {
    console.error('[AI Logo Picker] Failed (non-fatal):', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Fetch image buffer from URL or data: URI, with 3s timeout.
 */
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    // Handle data: URIs
    if (url.startsWith('data:')) {
      const commaIdx = url.indexOf(',')
      if (commaIdx === -1) return null
      // Fix 9: Skip data: URIs > 2MB
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
    // Skip tiny files (tracking pixels etc.)
    if (buf.length < 200) return null

    return buf
  } catch {
    return null
  }
}
