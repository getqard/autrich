import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite } from '@/lib/enrichment/scraper'
import { fetchBrandfetchLogo } from '@/lib/enrichment/brandfetch'
import { fetchGoogleFavicon, generateInitialsLogo, validateLogoCandidate } from '@/lib/enrichment/logo'
import { pickBestLogo } from '@/lib/enrichment/logo-picker'
import { extractPalette } from '@/lib/enrichment/colors'
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

      // 1. Brandfetch
      const bf = await fetchBrandfetchLogo(domain)
      if (bf) {
        logoBuffer = bf.buffer
        logoSource = bf.source
      }

      // 2. Website logo — AI Picker or score-based fallback
      if (!logoBuffer && result.logoCandidates?.length) {
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

      // Colors from logo
      let colors: EnrichmentColors = null
      if (logoBuffer) {
        try {
          const palette = await extractPalette(logoBuffer)
          colors = palette
        } catch { /* non-fatal */ }
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

      // Pass preview colors
      let passPreview: EnrichmentPassPreview = null
      const bgColor = (result.brandColors?.confidence >= 0.6 && result.brandColors.backgroundColor)
        ? result.brandColors.backgroundColor
        : colors?.dominant || (industry ? INDUSTRIES.find(i => i.slug === industry!.slug)?.default_color : null) || '#1a1a2e'

      const lum = hexLuminance(bgColor)
      passPreview = {
        bg: bgColor,
        text: lum > 0.5 ? '#000000' : '#ffffff',
        label: lum > 0.5 ? '#333333' : '#bbbbbb',
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

function hexLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}
