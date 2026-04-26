import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'

type PickResult = {
  index: number
  confidence: number
}

/**
 * Use Claude Haiku Vision to pick the best logo from a list of candidates.
 * Sends top 5 candidates as 128px thumbnails → AI picks the real logo.
 *
 * Returns null if no ANTHROPIC_API_KEY, API fail, or < 2 candidates.
 *
 * Accepts permissive type (just needs `url` + `source` + `score`).
 */
export async function pickBestLogo(
  candidates: Array<{ url: string; source: string; score: number }>,
  businessName: string
): Promise<PickResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (candidates.length < 2) return null

  const top = candidates.slice(0, 5)

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

  const imageContent: Anthropic.ImageBlockParam[] = validThumbnails.map((t) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/png' as const,
      data: t.buffer.toString('base64'),
    },
  }))

  const contentBlocks: Anthropic.ContentBlockParam[] = []
  for (let i = 0; i < validThumbnails.length; i++) {
    contentBlocks.push({ type: 'text', text: `Bild ${i + 1}:` })
    contentBlocks.push(imageContent[i])
  }

  contentBlocks.push({
    type: 'text',
    text: [
      `Du siehst ${validThumbnails.length} Bilder. Eines davon ist das Hauptlogo des Unternehmens "${businessName}".`,
      `Welches Bild (1-${validThumbnails.length}) ist das Logo? Antworte NUR mit JSON: {"pick": 3, "confidence": 0.95}`,
      'Regeln:',
      '- Bevorzuge: klare Marken-Schriftzüge, Grafikzeichen, Wort-Bild-Marken',
      '- Vermeide: Hero-Fotos, Produktbilder, Personenbilder, generische Stockfotos',
      '- Favicons/Icons sind okay, wenn nichts Besseres da ist (niedrige confidence)',
      '- Wenn der Geschäftsname im Bild lesbar ist, ist das ein STARKES Signal',
      '- WÄHLE IMMER EINEN: nimm den BESTEN Kandidaten, auch wenn keiner perfekt ist.',
      '  Drücke Unsicherheit über confidence aus (0.3 = unsicher, 0.95 = klar)',
      '- Nur wenn ALLE Bilder offensichtlich keine Logos sind (z.B. alle nur Produktfotos):',
      '  {"pick": 0, "confidence": 0}',
    ].join('\n'),
  })

  try {
    const client = new Anthropic()
    const apiAbort = new AbortController()
    const apiTimeout = setTimeout(() => apiAbort.abort(), 10000)

    const response = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
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

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return null
    }
    const pick = typeof parsed.pick === 'number' ? parsed.pick : 0
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0

    if (pick < 1 || pick > validThumbnails.length) return null

    const thumbnailIdx = pick - 1
    const originalIdx = validThumbnails[thumbnailIdx].index

    console.log(`[AI Logo Picker] Chose candidate #${originalIdx + 1} (${top[originalIdx].source}, score ${top[originalIdx].score}) with confidence ${confidence} for "${businessName}"`)

    return { index: originalIdx, confidence }
  } catch (err) {
    console.error('[AI Logo Picker] Failed (non-fatal):', err instanceof Error ? err.message : err)
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

// ─── Zentrale Logo-Auswahl-Pipeline ─────────────────────────────
//
// Bündelt: third-party-Filter + photo-Filter + business-name-match-Override
// + Vision-AI Tiebreaker. Ersetzt die 3 verschiedenen Logiken in
// tools/scrape, leads/[id]/enrich, pipeline/run-step.

const THIRD_PARTY_PATTERNS = [
  'instagram', 'insta-', 'insta_', 'facebook', 'fb-logo', 'tiktok', 'tik-tok',
  'youtube', 'yt-logo', 'whatsapp', 'telegram', 'pinterest', 'linkedin', 'snapchat',
  'lieferando', 'uber-logo', 'uber_logo', 'ubereats', 'deliveroo', 'wolt', 'doordash',
  'just-eat', 'foodora', 'gorillas', 'flink', 'yelp', 'tripadvisor', 'trustpilot',
  'paypal', 'stripe', 'klarna', 'visa', 'mastercard', 'wp-emoji', 'elementor',
] as const

const PHOTO_PATTERNS = [
  'image', 'photo', 'bild', 'foto', 'hochformat', 'querformat',
  'hero', 'banner', 'slider', 'intro', 'startseite', 'background',
  'header-bg', 'cover', 'gallery', 'portfolio', 'preview',
  'dsc', 'img_', 'pic_', 'screenshot', 'thumbnail',
] as const

export function isThirdPartyLogo(url: string): boolean {
  const lower = url.toLowerCase()
  return THIRD_PARTY_PATTERNS.some(p => lower.includes(p))
}

export function isLikelyPhoto(url: string): boolean {
  const filename = url.toLowerCase().split('/').pop() || ''
  return PHOTO_PATTERNS.some(p => filename.includes(p))
}

function normalize(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, ' ').trim()
}

function germanize(s: string): string {
  return s.toLowerCase()
    .replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, ' ').trim()
}

function getFilename(u: string): string {
  try { return decodeURIComponent(new URL(u).pathname.split('/').pop() || '') } catch { return u }
}

function getNameMatchCount(text: string, nameWordsNorm: string[], nameWordsGerm: string[]): number {
  const tNorm = normalize(text)
  const tGerm = germanize(text)
  let matches = 0
  for (const w of nameWordsNorm) if (tNorm.includes(w) || tGerm.includes(w)) matches++
  for (const w of nameWordsGerm) if (tNorm.includes(w) || tGerm.includes(w)) matches++
  return Math.min(matches, nameWordsNorm.length)
}

export type LogoSelection = {
  url: string
  source: string
  score: number
  reason: string
}

/**
 * Wählt das beste Logo aus einer Liste von Kandidaten.
 *
 * Pipeline:
 *   1. Filter: third-party + photo-Patterns
 *   2. Sort: nach Score
 *   3. Boost: business-name in filename → Override
 *   4. Vision-AI Tiebreaker (Haiku) wenn ≥2 valid candidates
 *   5. Fallback: höchster Score
 *
 * Returns null wenn keine Kandidaten oder alle gefiltert.
 *
 * Type ist permissiv — akzeptiert sowohl LogoCandidate (strict union)
 * als auch das inline-typed Array das aus DB/API kommt.
 */
export async function selectBestLogoUrl(
  candidates: Array<{ url: string; source: string; score: number }>,
  businessName: string,
  title: string | null = null,
): Promise<LogoSelection | null> {
  if (!candidates?.length) return null

  // Filter out third-party logos
  const nonThirdParty = candidates.filter(c => !isThirdPartyLogo(c.url))
  if (nonThirdParty.length === 0) {
    console.log('[LogoSelect] All candidates filtered as third-party')
    return null
  }

  const sorted = [...nonThirdParty].sort((a, b) => b.score - a.score)

  // Score-best as starting point
  let pickedUrl = sorted[0].url
  let pickedSource = sorted[0].source
  let pickedScore = sorted[0].score
  let reason = `score-best (${sorted[0].score})`

  // Business-name-in-filename override
  const nameSource = `${businessName || ''} ${title || ''}`
  const nameWordsNorm = normalize(nameSource).split(/\s+/).filter(w => w.length >= 3)
  const nameWordsGerm = germanize(nameSource).split(/\s+/).filter(w => w.length >= 3)

  if (nameWordsNorm.length >= 1) {
    const currentMatchCount = getNameMatchCount(getFilename(pickedUrl), nameWordsNorm, nameWordsGerm)
    const better = sorted
      .filter(c => !isLikelyPhoto(c.url) && c.score >= 40)
      .map(c => ({ ...c, nameMatches: getNameMatchCount(getFilename(c.url), nameWordsNorm, nameWordsGerm) }))
      .filter(c => c.nameMatches >= 2 && c.nameMatches > currentMatchCount)
      .sort((a, b) => b.nameMatches - a.nameMatches || b.score - a.score)[0]

    if (better) {
      pickedUrl = better.url
      pickedSource = better.source
      pickedScore = better.score
      reason = `name-match (${better.nameMatches} matches in filename)`
      console.log(`[LogoSelect] Override: ${getFilename(better.url)} (${better.nameMatches} name matches)`)
    }
  }

  // Vision-AI tiebreaker (only on top 5, only if ≥2)
  const top5 = sorted.slice(0, 5)
  if (top5.length >= 2 && process.env.ANTHROPIC_API_KEY) {
    try {
      const aiPick = await pickBestLogo(top5, businessName)
      if (aiPick && aiPick.confidence >= 0.5) {
        const chosen = top5[aiPick.index]
        pickedUrl = chosen.url
        pickedSource = chosen.source
        pickedScore = chosen.score
        reason = `ai-vision (confidence ${aiPick.confidence})`
        console.log(`[LogoSelect] AI-Vision picked ${aiPick.index + 1}/${top5.length} (confidence ${aiPick.confidence})`)
      } else if (aiPick) {
        console.log(`[LogoSelect] AI-Vision low confidence (${aiPick.confidence}) → keeping ${reason}`)
      }
    } catch (err) {
      console.log(`[LogoSelect] AI-Vision failed (non-fatal): ${err instanceof Error ? err.message : err}`)
    }
  }

  return { url: pickedUrl, source: pickedSource, score: pickedScore, reason }
}
