import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite } from '@/lib/enrichment/scraper'
import { captureWebsite } from '@/lib/enrichment/screenshot'
import { fetchGoogleFavicon, generateInitialsLogo, validateLogoCandidate } from '@/lib/enrichment/logo'
import { pickBestLogo } from '@/lib/enrichment/logo-picker'
import { fetchInstagramAvatar } from '@/lib/enrichment/instagram'
import { determinePassColors } from '@/lib/enrichment/pass-colors'
import { getCachedScrape, setCachedScrape } from '@/lib/enrichment/scrape-cache'
import { normalizeDomain } from '@/lib/scraping/domain-utils'
import { mapGmapsCategory } from '@/data/gmaps-category-map'
import { INDUSTRIES } from '@/data/industries-seed'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, gmaps_category, gmaps_categories, business_name, force } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL ist erforderlich' }, { status: 400 })
    }

    // ─── Cache Check ──────────────────────────────────────────
    const domain = normalizeDomain(url)
    let cacheHit = false
    let cachedAt: string | null = null

    if (!force && domain) {
      const cached = await getCachedScrape(url)
      if (cached) {
        cacheHit = true
        cachedAt = cached.cachedAt

        // Return cached result with enrichment preview from cache
        const result = cached.scrapeResult
        const enrichmentPreview = buildEnrichmentPreviewFromCache(cached, gmaps_category, gmaps_categories)

        return NextResponse.json({
          ...result,
          enrichmentPreview,
          _cache: { hit: true, cachedAt, domain },
        })
      }
    }

    // ─── Fresh Scrape ─────────────────────────────────────────
    const result = await scrapeWebsite(url)

    // Skip screenshot for instagram-only URLs
    const isInstagramOnly = result.websiteType === 'instagram-only' || result.websiteType === 'redirect-to-instagram'
    const headerScreenshot = isInstagramOnly ? null : await captureWebsite(url)

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

      // Instagram-only: skip normal logo pipeline, just fetch avatar
      if (isInstagramOnly && result.socialLinks?.instagram) {
        try {
          const igBuffer = await fetchInstagramAvatar(result.socialLinks.instagram)
          if (igBuffer) {
            logoBuffer = igBuffer
            logoSource = 'instagram'
          }
        } catch { /* non-fatal */ }

        if (!logoBuffer && business_name) {
          logoBuffer = await generateInitialsLogo(business_name, '#1a1a2e')
          logoSource = 'generated'
        }

        const passColors = await determinePassColors({
          logoBuffer,
          cssCandidates: [],
          headerBackground: null,
          headerScreenshot: null,
          websiteContext: { title: null, description: null, themeColor: null },
          industrySlug: null,
          industryDefaults: null,
          gmapsPhotoBuffer: null,
        })

        enrichmentPreview = {
          logo: logoBuffer && logoSource ? { base64: logoBuffer.toString('base64'), source: logoSource } : null,
          colors: null,
          industry: null,
          passPreview: {
            bg: passColors.backgroundColor,
            text: passColors.textColor,
            label: passColors.labelColor,
            method: passColors.method,
          },
        }

        // Cache the result
        await setCachedScrape(url, {
          scrapeResult: { ...result, enrichmentPreview },
          logoBuffer,
          logoSource,
          screenshotBuffer: null,
          passColors: {
            bg: passColors.backgroundColor,
            text: passColors.textColor,
            label: passColors.labelColor,
            method: passColors.method,
          },
        })

        return NextResponse.json({
          ...result,
          enrichmentPreview,
          _cache: { hit: false, domain },
        })
      }

      // Normal website flow

      // 1. Website logo (AI Picker or score-based)
      if (result.logoCandidates?.length) {
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
              const contentLength = logoRes.headers.get('content-length')
              if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
                throw new Error('Logo too large')
              }
              buf = Buffer.from(await logoRes.arrayBuffer())
              if (buf.length > 5 * 1024 * 1024) throw new Error('Logo too large')
            }
            if (buf.length > 500) {
              logoBuffer = buf
              logoSource = 'website'
            }
          } catch { /* non-fatal */ }
        }
      }

      // 2. Instagram Profilbild
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
        const scrapeDomain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
        const fav = await fetchGoogleFavicon(scrapeDomain)
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

      // ─── COLOR DETERMINATION ────────────────────────────────
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

      // ─── Cache Result ──────────────────────────────────────
      await setCachedScrape(url, {
        scrapeResult: { ...result, enrichmentPreview },
        logoBuffer,
        logoSource,
        screenshotBuffer: headerScreenshot,
        passColors: {
          bg: passColors.backgroundColor,
          text: passColors.textColor,
          label: passColors.labelColor,
          method: passColors.method,
        },
      })
    } catch (err) {
      console.error('Enrichment preview failed (non-fatal):', err)
    }

    return NextResponse.json({
      ...result,
      enrichmentPreview,
      _cache: { hit: false, domain },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scraping fehlgeschlagen' },
      { status: 500 }
    )
  }
}

// ─── Cache Helper ───────────────────────────────────────────────

function buildEnrichmentPreviewFromCache(
  cached: { scrapeResult: Record<string, unknown>; logoBuffer: Buffer | null; logoSource: string | null; passColors: Record<string, unknown> | null },
  gmapsCategory?: string,
  gmapsCategories?: string[],
) {
  // If the cached scrape result already has enrichmentPreview, use it
  const cachedPreview = cached.scrapeResult.enrichmentPreview as Record<string, unknown> | undefined
  if (cachedPreview) return cachedPreview

  // Reconstruct from cache data
  let industry = null
  if (gmapsCategory || gmapsCategories?.length) {
    const slug = mapGmapsCategory(gmapsCategory || null, gmapsCategories || [])
    if (slug) {
      const ind = INDUSTRIES.find(i => i.slug === slug)
      industry = {
        slug,
        method: 'gmaps',
        gmapsCategory: gmapsCategory || null,
        emoji: ind?.emoji ?? null,
        defaultReward: ind?.default_reward ?? null,
      }
    }
  }

  return {
    logo: cached.logoBuffer && cached.logoSource
      ? { base64: cached.logoBuffer.toString('base64'), source: cached.logoSource }
      : null,
    colors: null,
    industry,
    passPreview: cached.passColors ? {
      bg: cached.passColors.bg as string,
      text: cached.passColors.text as string,
      label: cached.passColors.label as string,
      method: cached.passColors.method as string,
    } : null,
  }
}
