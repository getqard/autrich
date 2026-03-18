import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite } from '@/lib/enrichment/scraper'
import { fetchBrandfetchLogo } from '@/lib/enrichment/brandfetch'
import { fetchGoogleFavicon, generateInitialsLogo, validateLogoCandidate } from '@/lib/enrichment/logo'
import { pickBestLogo } from '@/lib/enrichment/logo-picker'
import { pickBrandColors } from '@/lib/enrichment/color-picker'
import { extractPalette, isBoringColor, hexLuminance } from '@/lib/enrichment/colors'
import { mapGmapsCategory } from '@/data/gmaps-category-map'
import { INDUSTRIES } from '@/data/industries-seed'

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

      // Extract vibrant palette from logo (needed for fallback even if AI succeeds)
      if (logoBuffer) {
        try {
          const palette = await extractPalette(logoBuffer)
          colors = palette
        } catch { /* non-fatal */ }
      }

      // Step 1: AI Color Picker
      if (logoBuffer) {
        try {
          const aiColors = await pickBrandColors(
            logoBuffer,
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

      // Step 3: Logo palette (node-vibrant)
      if (!passPreviewBg && colors?.dominant) {
        if (!isBoringColor(colors.dominant)) {
          passPreviewBg = colors.dominant
          passPreviewAccent = colors.accent
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

