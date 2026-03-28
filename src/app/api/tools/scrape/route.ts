import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite } from '@/lib/enrichment/scraper'
import { captureWebsite } from '@/lib/enrichment/screenshot'
import { fetchGoogleFavicon, generateInitialsLogo, validateLogoCandidate } from '@/lib/enrichment/logo'
import { fetchInstagramAvatar } from '@/lib/enrichment/instagram'
import { determinePassColors } from '@/lib/enrichment/pass-colors'
import { checkLogoVisibility } from '@/lib/enrichment/logo-contrast-check'
import { getCachedScrape, setCachedScrape } from '@/lib/enrichment/scrape-cache'
import { scrapeImpressum, extractHeadlines, extractAboutPage } from '@/lib/enrichment/impressum'
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

    // ─── Impressum + Website Text (non-blocking) ────────────
    let impressumData: { contactName: string | null; firstName: string | null; lastName: string | null; foundingYear: number | null; source: string | null } = {
      contactName: null, firstName: null, lastName: null, foundingYear: null, source: null,
    }
    let websiteHeadlines = ''
    let websiteAbout: string | null = null

    if (!isInstagramOnly) {
      try {
        // Fetch homepage HTML for impressum/about extraction
        const baseUrl = result.finalUrl || (url.startsWith('http') ? url : `https://${url}`)
        const controller = new AbortController()
        const htmlTimeout = setTimeout(() => controller.abort(), 5000)
        const htmlRes = await fetch(baseUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        })
        clearTimeout(htmlTimeout)
        const homepageHtml = htmlRes.ok ? await htmlRes.text() : null

        if (!homepageHtml) throw new Error('Could not fetch homepage HTML')
        const [impressum, about] = await Promise.all([
          scrapeImpressum(homepageHtml, baseUrl),
          extractAboutPage(homepageHtml, baseUrl),
        ])
        impressumData = impressum
        websiteAbout = about
        websiteHeadlines = extractHeadlines(homepageHtml)

        if (impressumData.contactName) {
          console.log(`[Scrape] Impressum: ${impressumData.contactName} (${impressumData.source})`)
        }
        if (impressumData.foundingYear) {
          console.log(`[Scrape] Founded: ${impressumData.foundingYear}`)
        }
      } catch (err) {
        console.log(`[Scrape] Impressum/About failed (non-fatal): ${err instanceof Error ? err.message : err}`)
      }
    }

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

      // 1. Website logo — use bestLogo from scraper (score-based)
      // Then: third-party filter + business-name-in-URL override
      if (result.logoCandidates?.length) {
        const THIRD_PARTY = ['instagram', 'insta-', 'insta_', 'facebook', 'fb-logo', 'tiktok', 'tik-tok',
          'youtube', 'yt-logo', 'whatsapp', 'telegram', 'pinterest', 'linkedin', 'snapchat',
          'lieferando', 'uber-logo', 'uber_logo', 'ubereats', 'deliveroo', 'wolt', 'doordash',
          'just-eat', 'foodora', 'gorillas', 'flink', 'yelp', 'tripadvisor', 'trustpilot',
          'paypal', 'stripe', 'klarna', 'visa', 'mastercard', 'wp-emoji', 'elementor']
        const isThirdParty = (url: string) => THIRD_PARTY.some(p => url.toLowerCase().includes(p))

        // Normalize text for fuzzy matching (handles umlauts: ö→o AND ö→oe)
        const normalize = (s: string) => s.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, ' ').trim()
        const germanize = (s: string) => s.toLowerCase()
          .replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
          .replace(/[^a-z0-9]/g, ' ').trim()

        // Extract significant words (≥3 chars) from business name + title
        const nameSource = `${business_name || ''} ${result.title || ''}`
        const nameWordsNorm = normalize(nameSource).split(/\s+/).filter(w => w.length >= 3)
        const nameWordsGerm = germanize(nameSource).split(/\s+/).filter(w => w.length >= 3)

        // Check if a URL contains business name words
        const getNameMatchCount = (url: string): number => {
          const urlNorm = normalize(url)
          const urlGerm = germanize(url)
          let matches = 0
          for (const word of nameWordsNorm) {
            if (urlNorm.includes(word) || urlGerm.includes(word)) matches++
          }
          for (const word of nameWordsGerm) {
            if (urlNorm.includes(word) || urlGerm.includes(word)) matches++
          }
          // Deduplicate (a word might match in both normalized forms)
          return Math.min(matches, nameWordsNorm.length)
        }

        // Start with bestLogo
        let pickedUrl = result.bestLogo?.url || null

        // Filter: if bestLogo is third-party → next best
        if (pickedUrl && isThirdParty(pickedUrl)) {
          console.log(`[Scrape] bestLogo is third-party, finding next...`)
          const nextBest = result.logoCandidates
            .filter(c => !isThirdParty(c.url) && c.score >= 40)
            .sort((a, b) => b.score - a.score)[0]
          pickedUrl = nextBest?.url || null
        }

        // Photo/image detection — these are NEVER logos even if they contain the business name
        const PHOTO_PATTERNS = [
          'image', 'photo', 'bild', 'foto', 'hochformat', 'querformat',
          'hero', 'banner', 'slider', 'intro', 'startseite', 'background',
          'header-bg', 'cover', 'gallery', 'portfolio', 'preview',
          'dsc', 'img_', 'pic_', 'screenshot', 'thumbnail',
        ]
        const isLikelyPhoto = (url: string) => {
          const filename = url.toLowerCase().split('/').pop() || ''
          return PHOTO_PATTERNS.some(p => filename.includes(p))
        }

        // Override: if another candidate has the business name in FILENAME → prefer it
        // But ONLY for candidates that look like logos, NOT photos
        if (pickedUrl && nameWordsNorm.length >= 1) {
          const getFilename = (u: string) => {
            try { return decodeURIComponent(new URL(u).pathname.split('/').pop() || '') } catch { return u }
          }
          const getFilenameMatchCount = (u: string): number => {
            const fn = getFilename(u)
            const fnNorm = normalize(fn)
            const fnGerm = germanize(fn)
            let matches = 0
            for (const word of nameWordsNorm) {
              if (fnNorm.includes(word) || fnGerm.includes(word)) matches++
            }
            for (const word of nameWordsGerm) {
              if (fnNorm.includes(word) || fnGerm.includes(word)) matches++
            }
            return Math.min(matches, nameWordsNorm.length)
          }

          const bestMatchCount = getFilenameMatchCount(pickedUrl)
          const betterCandidate = result.logoCandidates
            .filter(c => !isThirdParty(c.url) && !isLikelyPhoto(c.url) && c.score >= 40)
            .map(c => ({ ...c, nameMatches: getFilenameMatchCount(c.url) }))
            .filter(c => c.nameMatches >= 2 && c.nameMatches > bestMatchCount)
            .sort((a, b) => b.nameMatches - a.nameMatches || b.score - a.score)[0]

          if (betterCandidate) {
            console.log(`[Scrape] Logo override: ${getFilename(betterCandidate.url)} (${betterCandidate.nameMatches} name matches)`)
            pickedUrl = betterCandidate.url
          }
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
        allowScreenshotFallback: true, // manual scrape tool = best quality
      })

      // ─── LOGO VISIBILITY CHECK ──────────────────────────────
      // Check if logo is visible on chosen bg — swap variant or adjust bg if not
      if (logoBuffer && result.logoCandidates?.length > 1) {
        try {
          const visCheck = await checkLogoVisibility(
            logoBuffer,
            passColors.backgroundColor,
            result.logoCandidates,
            result.bestLogo?.url || null,
            business_name || result.title || undefined,
          )

          if (visCheck.newLogoBuffer) {
            // Found a better logo variant with good contrast
            logoBuffer = visCheck.newLogoBuffer
            logoSource = visCheck.newLogoSource || logoSource
            console.log(`[Scrape] Logo swapped for better contrast: ${visCheck.newLogoSource}`)
          } else if (visCheck.adjustedBg) {
            // No better variant — bg was adjusted
            passColors.backgroundColor = visCheck.adjustedBg
            console.log(`[Scrape] BG adjusted for logo visibility: ${visCheck.adjustedBg}`)
          }
        } catch (err) {
          console.error('Logo contrast check failed (non-fatal):', err)
        }
      }

      // Rasterize SVG logos to PNG for preview
      if (logoBuffer) {
        const head = logoBuffer.subarray(0, 256).toString('utf8').trim()
        if (head.startsWith('<svg') || head.startsWith('<?xml') || head.includes('<svg')) {
          try {
            const sharp = (await import('sharp')).default
            logoBuffer = await sharp(logoBuffer)
              .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
              .png()
              .toBuffer()
          } catch { /* keep original buffer */ }
        }
      }

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
      impressum: impressumData.contactName ? {
        contactName: impressumData.contactName,
        firstName: impressumData.firstName,
        lastName: impressumData.lastName,
        foundingYear: impressumData.foundingYear,
      } : null,
      websiteHeadlines: websiteHeadlines || null,
      websiteAbout: websiteAbout || null,
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
