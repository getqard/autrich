/**
 * AI Logo Picker — Haiku Vision picks the real business logo
 *
 * When score-based selection might pick the wrong logo (decorative icons,
 * third-party badges), this uses Vision AI to look at all candidates and
 * pick the one that's actually the business logo.
 *
 * Cost: ~$0.001 per call (Haiku + thumbnails)
 */

import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'

// Third-party logos/icons that should be filtered out before AI sees them
const THIRD_PARTY_PATTERNS = [
  'google', 'facebook', 'instagram', 'twitter', 'tiktok', 'youtube',
  'yelp', 'tripadvisor', 'whatsapp', 'telegram', 'pinterest',
  'linkedin', 'paypal', 'stripe', 'plugin', 'widget', 'review',
  'trustpilot', 'capterra', 'g2crowd', 'lieferando', 'uber-logo',
  'ubereats', 'uber-eats', 'deliveroo', 'wolt', 'doordash',
  'grubhub', 'just-eat', 'foodora', 'gorillas', 'flink',
  'insta-logo', 'tiktok-logo', 'fb-logo', 'social',
]

function isThirdPartyUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return THIRD_PARTY_PATTERNS.some(p => lower.includes(p))
}

async function fetchThumbnail(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('data:')) {
      const commaIdx = url.indexOf(',')
      if (commaIdx === -1 || url.length > 500000) return null
      const header = url.substring(0, commaIdx).toLowerCase()
      const data = url.substring(commaIdx + 1)
      const buf = header.includes('base64')
        ? Buffer.from(data, 'base64')
        : Buffer.from(decodeURIComponent(data))
      if (buf.length < 200) return null
      return buf
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
 * Use Haiku Vision to pick the real business logo from candidates.
 *
 * @param candidates - Logo candidates from the scraper (sorted by score)
 * @param businessName - Name of the business (from GMaps or website title)
 * @returns The best logo candidate, or null if AI can't decide
 */
export async function aiPickBestLogo(
  candidates: Array<{ url: string; score: number; source: string }>,
  businessName: string,
): Promise<{ url: string; buffer: Buffer; source: string } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (candidates.length < 2) return null

  // Filter out third-party logos
  const filtered = candidates
    .filter(c => !isThirdPartyUrl(c.url))
    .filter(c => c.score >= 40)
    .slice(0, 6) // Max 6 to keep API cost low

  if (filtered.length < 2) {
    // Only 1 non-third-party candidate — use it directly
    if (filtered.length === 1) {
      const buf = await fetchThumbnail(filtered[0].url)
      if (buf) return { url: filtered[0].url, buffer: buf, source: filtered[0].source }
    }
    return null
  }

  // Download + create thumbnails
  const thumbnails = await Promise.all(
    filtered.map(async (c, i) => {
      try {
        const buf = await fetchThumbnail(c.url)
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
  if (valid.length < 2) {
    // Only 1 valid — return it
    if (valid.length === 1) {
      const c = filtered[valid[0].index]
      return { url: c.url, buffer: valid[0].buffer, source: c.source }
    }
    return null
  }

  // Build vision message
  const contentBlocks: Anthropic.ContentBlockParam[] = []
  for (let i = 0; i < valid.length; i++) {
    contentBlocks.push({ type: 'text', text: `Bild ${i + 1}:` })
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: valid[i].thumb.toString('base64') },
    })
  }

  contentBlocks.push({
    type: 'text',
    text: [
      `Das Geschäft heißt "${businessName}".`,
      `Welches Bild (1-${valid.length}) ist das echte Logo dieses Geschäfts?`,
      '',
      'Regeln:',
      '- Wähle das Logo das den Geschäftsnamen oder die Marke darstellt',
      '- NICHT: Social Media Icons, Lieferdienst-Logos, dekorative Symbole',
      '- Das Favicon/App-Icon ist oft eine gute Wahl',
      '- Wenn keins passt: {"pick": 0}',
      '',
      'Antworte NUR mit JSON: {"pick": 2, "reason": "kurze Begründung"}',
    ].join('\n'),
  })

  try {
    const client = new Anthropic()
    const apiAbort = new AbortController()
    const apiTimeout = setTimeout(() => apiAbort.abort(), 10000)

    const response = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
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
    const source = filtered[chosen.index].source
    const url = filtered[chosen.index].url

    console.log(`[Logo AI] Picked logo ${pick}: ${source} — ${(parsed.reason as string) || ''}`)

    return { url, buffer: chosen.buffer, source }
  } catch (err) {
    console.error('[Logo AI] Failed:', err instanceof Error ? err.message : err)
    return null
  }
}
