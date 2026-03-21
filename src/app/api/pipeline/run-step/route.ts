import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite } from '@/lib/enrichment/scraper'
import { captureWebsite } from '@/lib/enrichment/screenshot'
import { fetchGoogleFavicon, generateInitialsLogo, validateLogoCandidate } from '@/lib/enrichment/logo'
import { pickBestLogo } from '@/lib/enrichment/logo-picker'
import { fetchInstagramAvatar } from '@/lib/enrichment/instagram'
import { determinePassColors } from '@/lib/enrichment/pass-colors'
import { classifyIndustry, classifyBusiness, generateCreativeContent } from '@/lib/ai/classifier'
import { getCachedScrape, setCachedScrape } from '@/lib/enrichment/scrape-cache'
import { matchStripTemplate, detectColorVariant } from '@/lib/wallet/strip'
import { generateStripImage } from '@/lib/wallet/strip-generator'
import { INDUSTRIES } from '@/data/industries-seed'

/**
 * POST /api/pipeline/run-step
 * Runs a single pipeline step with provided context.
 *
 * Body: { step: string, url: string, context: Record<string, unknown>, force?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { step, url, context = {}, force = false } = body

    if (!step) {
      return NextResponse.json({ error: 'Step ist erforderlich' }, { status: 400 })
    }

    const startTime = Date.now()

    switch (step) {
      case 'scrape':
        return await runScrapeStep(url, force, startTime)

      case 'logo':
        return await runLogoStep(url, context, startTime)

      case 'colors':
        return await runColorsStep(url, context, startTime)

      case 'classify':
        return await runClassifyStep(url, context, startTime)

      case 'strip':
        return await runStripStep(context, startTime)

      default:
        return NextResponse.json({ error: `Unknown step: ${step}` }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Step fehlgeschlagen' },
      { status: 500 }
    )
  }
}

// ─── Step Implementations ────────────────────────────────────────

async function runScrapeStep(url: string, force: boolean, startTime: number) {
  if (!url) {
    return NextResponse.json({ error: 'URL ist erforderlich für Scrape' }, { status: 400 })
  }

  // Check cache first (unless force)
  let cacheHit = false
  if (!force) {
    const cached = await getCachedScrape(url)
    if (cached) {
      cacheHit = true
      return NextResponse.json({
        step: 'scrape',
        success: true,
        cacheHit: true,
        cachedAt: cached.cachedAt,
        durationMs: Date.now() - startTime,
        data: cached.scrapeResult,
      })
    }
  }

  // Fresh scrape
  const scrapeResult = await scrapeWebsite(url)

  // Capture screenshot (skip for instagram-only)
  const isInstagramOnly = scrapeResult.websiteType === 'instagram-only' || scrapeResult.websiteType === 'redirect-to-instagram'
  const screenshot = isInstagramOnly ? null : await captureWebsite(url)

  // Cache result
  await setCachedScrape(url, {
    scrapeResult: { ...scrapeResult, _hasScreenshot: !!screenshot },
    screenshotBuffer: screenshot,
  })

  return NextResponse.json({
    step: 'scrape',
    success: true,
    cacheHit,
    durationMs: Date.now() - startTime,
    data: scrapeResult,
  })
}

async function runLogoStep(url: string, context: Record<string, unknown>, startTime: number) {
  const scrapeData = context.scrapeData as Record<string, unknown> | undefined
  if (!scrapeData) {
    return NextResponse.json({ error: 'scrapeData context required' }, { status: 400 })
  }

  const logoCandidates = scrapeData.logoCandidates as Array<{ url: string; score: number; source: string; width: number | null; height: number | null }> | undefined
  const socialLinks = scrapeData.socialLinks as Record<string, string> | undefined
  const businessName = (context.businessName as string) || (scrapeData.title as string) || 'Business'
  const isInstagramOnly = scrapeData.websiteType === 'instagram-only' || scrapeData.websiteType === 'redirect-to-instagram'

  let logoBuffer: Buffer | null = null
  let logoSource: string | null = null

  // Instagram-only: just fetch avatar
  if (isInstagramOnly && socialLinks?.instagram) {
    try {
      const igBuffer = await fetchInstagramAvatar(socialLinks.instagram)
      if (igBuffer) {
        logoBuffer = igBuffer
        logoSource = 'instagram'
      }
    } catch { /* non-fatal */ }
  }

  // Website logo (AI Picker or score-based)
  if (!logoBuffer && logoCandidates?.length) {
    let pickedUrl: string | null = null

    if (logoCandidates.length >= 2) {
      try {
        const aiPick = await pickBestLogo(logoCandidates as Parameters<typeof pickBestLogo>[0], businessName)
        if (aiPick && aiPick.confidence >= 0.7) {
          const picked = logoCandidates[aiPick.index]
          const validation = await validateLogoCandidate(picked.url)
          if (validation.valid) pickedUrl = picked.url
        }
      } catch { /* non-fatal */ }
    }

    if (!pickedUrl) {
      const sorted = [...logoCandidates].sort((a, b) => b.score - a.score)
      pickedUrl = sorted[0]?.url || null
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
          const res = await fetch(pickedUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
          })
          clearTimeout(timeout)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          buf = Buffer.from(await res.arrayBuffer())
          if (buf.length > 5 * 1024 * 1024) throw new Error('Too large')
        }
        if (buf.length > 500) {
          logoBuffer = buf
          logoSource = 'website'
        }
      } catch { /* non-fatal */ }
    }
  }

  // Instagram avatar fallback
  if (!logoBuffer && socialLinks?.instagram) {
    try {
      const igBuffer = await fetchInstagramAvatar(socialLinks.instagram)
      if (igBuffer) {
        logoBuffer = igBuffer
        logoSource = 'instagram'
      }
    } catch { /* non-fatal */ }
  }

  // Google Favicon fallback
  if (!logoBuffer && url) {
    try {
      const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
      const fav = await fetchGoogleFavicon(domain)
      if (fav) {
        logoBuffer = fav
        logoSource = 'favicon'
      }
    } catch { /* non-fatal */ }
  }

  // Generated initials (always succeeds)
  if (!logoBuffer) {
    logoBuffer = await generateInitialsLogo(businessName, '#1a1a2e')
    logoSource = 'generated'
  }

  return NextResponse.json({
    step: 'logo',
    success: true,
    durationMs: Date.now() - startTime,
    data: {
      source: logoSource,
      base64: logoBuffer.toString('base64'),
      sizeBytes: logoBuffer.length,
    },
  })
}

async function runColorsStep(url: string, context: Record<string, unknown>, startTime: number) {
  const scrapeData = context.scrapeData as Record<string, unknown> | undefined
  const logoBase64 = context.logoBase64 as string | undefined

  const logoBuffer = logoBase64 ? Buffer.from(logoBase64, 'base64') : null

  // Try to get screenshot from cache
  let headerScreenshot: Buffer | null = null
  if (url) {
    const cached = await getCachedScrape(url)
    if (cached?.screenshotBuffer) {
      headerScreenshot = cached.screenshotBuffer
    }
  }

  const industrySlug = context.industrySlug as string | null || null
  const industryDefaults = industrySlug
    ? INDUSTRIES.find(i => i.slug === industrySlug) ?? null
    : null

  const passColors = await determinePassColors({
    logoBuffer,
    cssCandidates: ((scrapeData?.brandColors as Record<string, unknown>)?.candidates || []) as Parameters<typeof determinePassColors>[0]['cssCandidates'],
    headerBackground: (scrapeData?.brandColors as Record<string, unknown>)?.headerBackground as string ?? null,
    headerScreenshot,
    websiteContext: {
      title: scrapeData?.title as string || null,
      description: scrapeData?.description as string || null,
      themeColor: scrapeData?.themeColor as string || null,
    },
    industrySlug,
    industryDefaults,
    gmapsPhotoBuffer: null,
  })

  return NextResponse.json({
    step: 'colors',
    success: true,
    durationMs: Date.now() - startTime,
    data: {
      backgroundColor: passColors.backgroundColor,
      textColor: passColors.textColor,
      labelColor: passColors.labelColor,
      accentColor: passColors.accentColor,
      method: passColors.method,
      palette: passColors.palette,
    },
  })
}

async function runClassifyStep(url: string, context: Record<string, unknown>, startTime: number) {
  const scrapeData = context.scrapeData as Record<string, unknown> | undefined
  const businessName = (context.businessName as string) || (scrapeData?.title as string) || ''
  const gmapsCategory = context.gmapsCategory as string | null || null
  const gmapsCategories = context.gmapsCategories as string[] || []

  // Try instant classification first
  const instantResult = classifyIndustry(gmapsCategory, gmapsCategories, businessName, null)

  if (instantResult) {
    // Got industry — now generate creative content
    const creative = await generateCreativeContent({
      business_name: businessName,
      industry: instantResult.industry,
      city: context.city as string | null,
      website_description: scrapeData?.description as string | null,
      gmaps_category: gmapsCategory,
      google_rating: null,
      google_reviews_count: null,
      has_existing_loyalty: scrapeData?.loyaltyDetected as boolean || false,
      has_app: scrapeData?.appDetected as boolean || false,
      social_links: scrapeData?.socialLinks as Record<string, string> || {},
    })

    return NextResponse.json({
      step: 'classify',
      success: true,
      durationMs: Date.now() - startTime,
      data: {
        industry: instantResult.industry,
        method: instantResult.method,
        ...creative,
      },
    })
  }

  // AI classification
  const aiResult = await classifyBusiness({
    business_name: businessName,
    industry: null,
    city: context.city as string | null,
    website_description: scrapeData?.description as string | null,
    gmaps_category: gmapsCategory,
    categories: gmapsCategories,
    google_rating: null,
    google_reviews_count: null,
    has_existing_loyalty: scrapeData?.loyaltyDetected as boolean || false,
    has_app: scrapeData?.appDetected as boolean || false,
    social_links: scrapeData?.socialLinks as Record<string, string> || {},
  })

  return NextResponse.json({
    step: 'classify',
    success: true,
    durationMs: Date.now() - startTime,
    data: {
      industry: aiResult.detected_industry,
      method: 'ai',
      detected_reward: aiResult.detected_reward,
      detected_reward_emoji: aiResult.detected_reward_emoji,
      detected_stamp_emoji: aiResult.detected_stamp_emoji,
      detected_pass_title: aiResult.detected_pass_title,
      detected_max_stamps: aiResult.detected_max_stamps,
      strip_prompt: aiResult.strip_prompt,
      email_hooks: aiResult.email_hooks,
      personalization_notes: aiResult.personalization_notes,
    },
  })
}

async function runStripStep(context: Record<string, unknown>, startTime: number) {
  const industrySlug = context.industrySlug as string
  const bgColor = context.backgroundColor as string

  if (!industrySlug || !bgColor) {
    return NextResponse.json({
      error: 'industrySlug and backgroundColor required in context',
    }, { status: 400 })
  }

  // Try template match first
  const match = await matchStripTemplate(industrySlug, bgColor)

  if (match) {
    return NextResponse.json({
      step: 'strip',
      success: true,
      durationMs: Date.now() - startTime,
      data: {
        source: 'template',
        variant: match.variant,
        distance: Math.round(match.distance),
        imageUrl: match.imageUrl,
        templateId: match.template.id,
      },
    })
  }

  // No template — generate with AI
  const variant = detectColorVariant(bgColor)
  const { buffer, prompt } = await generateStripImage(industrySlug, variant)

  return NextResponse.json({
    step: 'strip',
    success: true,
    durationMs: Date.now() - startTime,
    data: {
      source: 'ai_generated',
      variant,
      prompt,
      base64: buffer.toString('base64'),
      sizeBytes: buffer.length,
    },
  })
}
