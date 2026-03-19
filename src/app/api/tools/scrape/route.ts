import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite } from '@/lib/enrichment/scraper'
import { captureWebsite } from '@/lib/enrichment/screenshot'
import { fetchBrandfetchLogo } from '@/lib/enrichment/brandfetch'
import { fetchGoogleFavicon, generateInitialsLogo, validateLogoCandidate } from '@/lib/enrichment/logo'
import { pickBestLogo } from '@/lib/enrichment/logo-picker'
import { fetchInstagramAvatar } from '@/lib/enrichment/instagram'
import { determinePassColors } from '@/lib/enrichment/pass-colors'
import { mapGmapsCategory } from '@/data/gmaps-category-map'
import { INDUSTRIES } from '@/data/industries-seed'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, gmaps_category, gmaps_categories, business_name } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL ist erforderlich' }, { status: 400 })
    }

    // Parallel: Scrape website + capture header screenshot
    const [result, headerScreenshot] = await Promise.all([
      scrapeWebsite(url),
      captureWebsite(url),
    ])

    // ─── Enrichment Preview ─────────────────────────────────

    type EnrichmentLogo = { base64: string; source: string } | null
    type EnrichmentColors = { dominant: string; accent: string | null; textColor: string; labelColor: string; swatches: Array<{ name: string; hex: string; population: number; saturation: number }> } | null
    type EnrichmentIndustry = { slug: string; method: string; gmapsCategory: string | null; emoji: string | null; defaultReward: string | null } | null
    type EnrichmentPassPreview = { bg: string; text: string; label: string; method: string } | null

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
          console.log('[Scrape] Brandfetch returned lettermark, skipping')
        } else {
          brandfetchBuffer = bf.buffer
          brandfetchSource = bf.source
        }
      }

      // 2. Website logo — AI Picker or score-based fallback
      const hasStrongWebsiteLogo = result.bestLogo && result.bestLogo.score >= 90

      if ((hasStrongWebsiteLogo || !brandfetchBuffer) && result.logoCandidates?.length) {
        let pickedUrl: string | null = null

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

      // 2b. Brandfetch real logo as fallback
      if (!logoBuffer && brandfetchBuffer) {
        logoBuffer = brandfetchBuffer
        logoSource = brandfetchSource!
      }

      // 2c. Instagram Profilbild
      if (!logoBuffer && result.socialLinks?.instagram) {
        try {
          const igBuffer = await fetchInstagramAvatar(result.socialLinks.instagram)
          if (igBuffer) {
            logoBuffer = igBuffer
            logoSource = 'instagram'
          }
        } catch { /* non-fatal */ }
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

      // ─── Industry Mapping ─────────────────────────────────
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

      const industryDefaults = industry
        ? INDUSTRIES.find(i => i.slug === industry!.slug) ?? null
        : null

      // ─── COLOR DETERMINATION (unified) ────────────────────
      console.log(`[Scrape Route] brandColors exists=${!!result.brandColors}, candidates=${result.brandColors?.candidates?.length ?? 'undefined'}, headerBG=${result.brandColors?.headerBackground ?? 'undefined'}`)
      if (result.brandColors?.candidates?.length) {
        console.log(`[Scrape Route] Candidates:`, result.brandColors.candidates.map(c => `${c.hex} (${c.role}, ${c.source}, conf=${c.confidence.toFixed(2)})`).join(', '))
      }
      const passColors = await determinePassColors({
        logoBuffer,
        cssCandidates: result.brandColors?.candidates || [],
        headerBackground: result.brandColors?.headerBackground ?? null,
        headerScreenshot,
        websiteContext: {
          title: result.title,
          description: result.description,
          themeColor: result.themeColor,
        },
        industrySlug: industry?.slug ?? null,
        industryDefaults,
        gmapsPhotoBuffer: null,
      })

      enrichmentPreview = {
        logo: logoBuffer && logoSource ? { base64: logoBuffer.toString('base64'), source: logoSource } : null,
        colors: passColors.palette,
        industry,
        passPreview: {
          bg: passColors.backgroundColor,
          text: passColors.textColor,
          label: passColors.labelColor,
          method: passColors.method,
        },
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

