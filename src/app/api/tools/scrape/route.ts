import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { scrapeWebsite } from '@/lib/enrichment/scraper'
import { fetchBrandfetchLogo } from '@/lib/enrichment/brandfetch'
import { fetchGoogleFavicon, generateInitialsLogo, validateLogoCandidate } from '@/lib/enrichment/logo'
import { pickBestLogo } from '@/lib/enrichment/logo-picker'
import { pickBrandColors } from '@/lib/enrichment/color-picker'
import { extractPalette, isBoringColor, hexLuminance, darkenColor } from '@/lib/enrichment/colors'
import { mapGmapsCategory } from '@/data/gmaps-category-map'
import { INDUSTRIES } from '@/data/industries-seed'

/**
 * Ensure a buffer is rasterized PNG. SVGs and other vector formats
 * can't be read by node-vibrant, so we convert them first.
 */
async function ensureRasterBuffer(buf: Buffer): Promise<Buffer> {
  const head = buf.subarray(0, 256).toString('utf8').trim()
  const isSvg = head.startsWith('<svg') || head.startsWith('<?xml') || head.includes('<svg')

  if (isSvg) {
    return sharp(buf)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer()
  }

  try {
    const meta = await sharp(buf).metadata()
    if (meta.format === 'svg') {
      return sharp(buf)
        .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer()
    }
  } catch { /* not an image sharp knows, return as-is */ }

  return buf
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, gmaps_category, gmaps_categories, business_name } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL ist erforderlich' }, { status: 400 })
    }

    const result = await scrapeWebsite(url)

    // ─── Enrichment Preview ─────────────────────────────────
    // Try Brandfetch logo + node-vibrant palette + GMaps mapping

    type EnrichmentLogo = { base64: string; source: string } | null
    type EnrichmentColors = { dominant: string; accent: string | null; textColor: string; labelColor: string; swatches: Array<{ name: string; hex: string; population: number }> } | null
    type EnrichmentIndustry = { slug: string; method: string; gmapsCategory: string | null; emoji: string | null; defaultReward: string | null } | null
    type EnrichmentPassPreview = { bg: string; text: string; label: string } | null

    let enrichmentPreview: {
      logo: EnrichmentLogo
      colors: EnrichmentColors
      industry: EnrichmentIndustry
      passPreview: EnrichmentPassPreview
    } | null = null

    try {
      let logoBuffer: Buffer | null = null
      let logoSource: string | null = null

      // Extract domain
      const domain = new URL(url).hostname.replace(/^www\./, '')

      // 1. Brandfetch (but skip lettermarks — they're generic)
      let brandfetchBuffer: Buffer | null = null
      let brandfetchSource: string | null = null
      const bf = await fetchBrandfetchLogo(domain)
      if (bf) {
        if (bf.source === 'brandfetch-lettermark') {
          // Lettermark = generic fallback, skip for now
          console.log('[Scrape] Brandfetch returned lettermark, skipping')
        } else {
          brandfetchBuffer = bf.buffer
          brandfetchSource = bf.source
        }
      }

      // 2. Website logo — AI Picker or score-based fallback
      // If website has a strong logo (score >= 90), prefer it over Brandfetch
      const hasStrongWebsiteLogo = result.bestLogo && result.bestLogo.score >= 90

      // Try website logo if strong signal OR no Brandfetch real logo
      if ((hasStrongWebsiteLogo || !brandfetchBuffer) && result.logoCandidates?.length) {
        let pickedUrl: string | null = null

        // Try AI Logo Picker if multiple candidates + business_name available
        if (result.logoCandidates.length >= 2 && business_name) {
          try {
            const aiPick = await pickBestLogo(result.logoCandidates, business_name)
            if (aiPick && aiPick.confidence >= 0.7) {
              const picked = result.logoCandidates[aiPick.index]
              const validation = await validateLogoCandidate(picked.url)
              if (validation.valid) {
                pickedUrl = picked.url
              }
            }
          } catch { /* non-fatal */ }
        }

        // Fallback: use bestLogo (highest score)
        if (!pickedUrl && result.bestLogo) {
          pickedUrl = result.bestLogo.url
        }

        if (pickedUrl) {
          try {
            let buf: Buffer
            if (pickedUrl.startsWith('data:')) {
              const commaIdx = pickedUrl.indexOf(',')
              const header = pickedUrl.substring(0, commaIdx).toLowerCase()
              const data = pickedUrl.substring(commaIdx + 1)
              buf = header.includes('base64')
                ? Buffer.from(data, 'base64')
                : Buffer.from(decodeURIComponent(data))
            } else {
              const controller = new AbortController()
              const timeout = setTimeout(() => controller.abort(), 5000)
              const logoRes = await fetch(pickedUrl, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
              })
              clearTimeout(timeout)
              if (!logoRes.ok) throw new Error(`HTTP ${logoRes.status}`)
              buf = Buffer.from(await logoRes.arrayBuffer())
            }
            if (buf.length > 500) {
              logoBuffer = buf
              logoSource = 'website'
            }
          } catch { /* non-fatal */ }
        }
      }

      // 2b. Brandfetch real logo as fallback (if website didn't yield a logo)
      if (!logoBuffer && brandfetchBuffer) {
        logoBuffer = brandfetchBuffer
        logoSource = brandfetchSource!
      }

      // 3. Google Favicon
      if (!logoBuffer) {
        const fav = await fetchGoogleFavicon(domain)
        if (fav) {
          logoBuffer = fav
          logoSource = 'favicon'
        }
      }

      // 4. Generated initials
      if (!logoBuffer && business_name) {
        logoBuffer = await generateInitialsLogo(business_name, '#1a1a2e')
        logoSource = 'generated'
      }

      // ─── COLOR WATERFALL ──────────────────────────────────
      // 1. AI Color Picker (Haiku Vision) — looks at logo + CSS candidates
      // 2. CSS Brand Colors — only if colorful (not black/gray/white)
      // 3. Logo Palette (node-vibrant) — smart swatch selection
      // 4. Industry Default
      // 5. Fallback #1a1a2e

      let colors: EnrichmentColors = null
      let passPreviewBg: string | null = null
      let passPreviewAccent: string | null = null

      // Ensure logo is rasterized (SVG → PNG) before color extraction
      let rasterLogoBuffer: Buffer | null = null
      if (logoBuffer) {
        try {
          rasterLogoBuffer = await ensureRasterBuffer(logoBuffer)
        } catch {
          rasterLogoBuffer = logoBuffer // fallback to original
        }
      }

      // Extract vibrant palette from logo (needed for fallback even if AI succeeds)
      if (rasterLogoBuffer) {
        try {
          const palette = await extractPalette(rasterLogoBuffer)
          colors = palette
        } catch { /* non-fatal */ }
      }

      // Step 1: AI Color Picker
      if (rasterLogoBuffer) {
        try {
          const aiColors = await pickBrandColors(
            rasterLogoBuffer,
            { title: result.title, description: result.description, themeColor: result.themeColor },
            result.brandColors?.candidates || [],
          )
          if (aiColors && aiColors.confidence >= 0.7) {
            passPreviewBg = aiColors.background
            passPreviewAccent = aiColors.accent
          }
        } catch { /* non-fatal */ }
      }

      // Step 2: CSS Brand Colors (only if colorful)
      if (!passPreviewBg && result.brandColors?.confidence >= 0.6 && result.brandColors.backgroundColor) {
        if (!isBoringColor(result.brandColors.backgroundColor)) {
          passPreviewBg = result.brandColors.backgroundColor
          passPreviewAccent = result.brandColors.accentColor
        }
      }

      // Step 3: Logo palette (node-vibrant) — extractPalette now trims the logo
      // and uses saturation-ranking, so colors.dominant should be a real brand color
      if (!passPreviewBg && colors?.dominant) {
        if (!isBoringColor(colors.dominant)) {
          passPreviewBg = colors.dominant
          passPreviewAccent = colors.accent
        }
      }

      // Step 3b: Any saturated swatch from palette (when dominant was still boring)
      if (!passPreviewBg && colors?.swatches?.length) {
        const bestSaturated = colors.swatches
          .filter(s => s.saturation >= 0.15)
          .sort((a, b) => b.saturation - a.saturation)[0]
        if (bestSaturated) {
          const lum = hexLuminance(bestSaturated.hex)
          passPreviewBg = lum > 0.4
            ? darkenColor(bestSaturated.hex, Math.min(0.6, (lum - 0.25) / lum))
            : bestSaturated.hex
        }
      }

      // Industry mapping
      let industry: EnrichmentIndustry = null
      if (gmaps_category || gmaps_categories?.length) {
        const slug = mapGmapsCategory(gmaps_category || null, gmaps_categories || [])
        if (slug) {
          const ind = INDUSTRIES.find(i => i.slug === slug)
          industry = {
            slug,
            method: 'gmaps',
            gmapsCategory: gmaps_category || null,
            emoji: ind?.emoji ?? null,
            defaultReward: ind?.default_reward ?? null,
          }
        }
      }

      // Step 4: Industry default
      if (!passPreviewBg && industry) {
        const ind = INDUSTRIES.find(i => i.slug === industry!.slug)
        if (ind?.default_color) {
          passPreviewBg = ind.default_color
        }
      }

      // Step 5: Fallback
      const bgColor = passPreviewBg || '#1a1a2e'

      // Pass preview colors
      let passPreview: EnrichmentPassPreview = null
      const lum = hexLuminance(bgColor)
      passPreview = {
        bg: bgColor,
        text: lum > 0.5 ? '#000000' : '#ffffff',
        label: passPreviewAccent || (lum > 0.5 ? '#333333' : '#bbbbbb'),
      }

      enrichmentPreview = {
        logo: logoBuffer && logoSource ? { base64: logoBuffer.toString('base64'), source: logoSource } : null,
        colors,
        industry,
        passPreview,
      }
    } catch (err) {
      console.error('Enrichment preview failed (non-fatal):', err)
    }

    return NextResponse.json({ ...result, enrichmentPreview })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scraping fehlgeschlagen' },
      { status: 500 }
    )
  }
}

