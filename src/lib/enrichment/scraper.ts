import * as cheerio from 'cheerio'
import type { WebsiteData, LogoCandidate, WebsiteType } from './types'
import { extractBrandColors } from './css-colors'

/**
 * Detect if a URL is an Instagram profile link.
 * Returns the handle if detected, null otherwise.
 */
function detectInstagramUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('instagram.com') && !parsed.hostname.includes('instagr.am')) return null
    const pathMatch = parsed.pathname.match(/^\/([a-zA-Z0-9_.]+)\/?$/)
    if (!pathMatch) return null
    const handle = pathMatch[1].toLowerCase()
    const genericPaths = new Set([
      'p', 'explore', 'reel', 'reels', 'stories', 'accounts',
      'about', 'legal', 'developer', 'api', 'direct', 'tv',
      'share', 'sharer', 'intent', 'dialog',
    ])
    if (genericPaths.has(handle)) return null
    return handle
  } catch {
    return null
  }
}

export async function scrapeWebsite(inputUrl: string): Promise<WebsiteData> {
  const start = Date.now()

  const result: WebsiteData = {
    url: inputUrl,
    finalUrl: inputUrl,
    title: null,
    description: null,
    logoCandidates: [],
    bestLogo: null,
    structuredData: {},
    socialLinks: {},
    loyaltyDetected: false,
    appDetected: false,
    themeColor: null,
    brandColors: { backgroundColor: null, accentColor: null, headerBackground: null, source: null, confidence: 0, candidates: [] },
    scrapeDurationMs: 0,
    websiteType: 'website',
  }

  // Normalize URL
  let url = inputUrl.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }

  // Instagram-as-Website detection: check URL before scraping
  const igHandle = detectInstagramUrl(url)
  if (igHandle) {
    result.websiteType = 'instagram-only'
    result.socialLinks.instagram = igHandle
    result.scrapeDurationMs = Date.now() - start
    console.log(`[Scraper] Instagram-only URL detected: @${igHandle} — skipping website scrape`)
    return result
  }

  let html: string
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      },
    })

    clearTimeout(timeout)
    result.finalUrl = response.url

    if (!response.ok) {
      const statusText = response.status === 403 || response.status === 503
        ? 'Bot-Protection erkannt'
        : `HTTP ${response.status}`
      result.error = statusText
      result.scrapeDurationMs = Date.now() - start
      return result
    }

    // Fix 4: Only accept HTML responses — reject PDFs, images, etc.
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      result.error = `Kein HTML (Content-Type: ${contentType.split(';')[0]})`
      result.scrapeDurationMs = Date.now() - start
      return result
    }

    html = await response.text()

    // Redirect-to-Instagram detection: website redirected to Instagram
    const redirectIgHandle = detectInstagramUrl(result.finalUrl)
    if (redirectIgHandle) {
      result.websiteType = 'redirect-to-instagram'
      result.socialLinks.instagram = redirectIgHandle
      result.scrapeDurationMs = Date.now() - start
      console.log(`[Scraper] Website redirected to Instagram: @${redirectIgHandle}`)
      return result
    }
  } catch (err) {
    result.error = err instanceof Error && err.name === 'AbortError'
      ? 'Timeout (8s)'
      : 'Website nicht erreichbar'
    result.scrapeDurationMs = Date.now() - start
    return result
  }

  try {
    const $ = cheerio.load(html)
    const baseUrl = result.finalUrl

    // Title & Description
    result.title = $('title').first().text().trim() || null
    result.description =
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      null

    // Logo candidates (async for manifest.json fetch)
    result.logoCandidates = await extractLogoCandidates($, baseUrl, html)
    result.logoCandidates.sort((a, b) => b.score - a.score)
    result.bestLogo = result.logoCandidates[0] || null

    // JSON-LD Structured Data
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '')
        if (data) {
          const items = Array.isArray(data) ? data : [data]
          for (const item of items) {
            if (item['@type']) {
              result.structuredData['@type'] = item['@type']
            }
            if (item.servesCuisine) result.structuredData.servesCuisine = item.servesCuisine
            if (item.openingHours || item.openingHoursSpecification) {
              result.structuredData.openingHours = item.openingHours || item.openingHoursSpecification
            }
            if (item.telephone) result.structuredData.telephone = item.telephone
            if (item.priceRange) result.structuredData.priceRange = item.priceRange
            if (item.address) result.structuredData.address = item.address
            if (item.name) result.structuredData.name = item.name
            if (item.aggregateRating) result.structuredData.aggregateRating = item.aggregateRating
          }
        }
      } catch {
        // Broken JSON-LD, skip
      }
    })

    // Social Links
    const socialPatterns: Record<string, RegExp> = {
      instagram: /instagram\.com\/([a-zA-Z0-9_.]+)\/?$/,
      facebook: /facebook\.com\/([^/?#]+)/,
      tiktok: /tiktok\.com\/@?([^/?#]+)/,
    }

    // Generic Instagram paths that are NOT user handles
    const igGenericPaths = new Set([
      'p', 'explore', 'reel', 'reels', 'stories', 'accounts',
      'about', 'legal', 'developer', 'api', 'direct', 'tv',
      'share', 'sharer', 'intent', 'dialog',
    ])

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || ''
      for (const [platform, pattern] of Object.entries(socialPatterns)) {
        const match = href.match(pattern)
        if (match && match[1] && !result.socialLinks[platform]) {
          const handle = match[1]
          // Skip generic pages
          if (platform === 'instagram') {
            if (!igGenericPaths.has(handle.toLowerCase())) {
              result.socialLinks[platform] = handle
            }
          } else if (!['share', 'sharer', 'sharer.php', 'intent', 'dialog'].includes(handle)) {
            result.socialLinks[platform] = handle
          }
        }
      }
    })

    // Also detect Instagram handle from the URL itself (when user provides instagram.com/handle as website)
    try {
      const urlObj = new URL(result.finalUrl)
      if (urlObj.hostname.includes('instagram.com')) {
        const pathMatch = urlObj.pathname.match(/^\/([a-zA-Z0-9_.]+)\/?$/)
        if (pathMatch && !igGenericPaths.has(pathMatch[1].toLowerCase()) && !result.socialLinks.instagram) {
          result.socialLinks.instagram = pathMatch[1]
        }
      }
    } catch { /* invalid URL, skip */ }

    // Theme Color — von Website Meta Tags (NICHT vom Logo!)
    const themeColor =
      $('meta[name="theme-color"]').attr('content')?.trim() ||
      $('meta[name="msapplication-TileColor"]').attr('content')?.trim() ||
      null
    if (themeColor && /^#[0-9a-fA-F]{3,8}$/.test(themeColor)) {
      result.themeColor = themeColor.length === 4
        ? `#${themeColor[1]}${themeColor[1]}${themeColor[2]}${themeColor[2]}${themeColor[3]}${themeColor[3]}`
        : themeColor.substring(0, 7) // strip alpha if 8-char hex
    }

    // Brand Colors from CSS (much more reliable than logo-based extraction)
    result.brandColors = await extractBrandColors(html, baseUrl)

    // Loyalty / App Detection
    const pageText = $('body').text().toLowerCase()
    const loyaltyKeywords = [
      'stempelkarte', 'treuekarte', 'loyalty', 'bonuskarte',
      'stamp card', 'punkte sammeln', 'treueprogramm', 'loyalty program',
    ]
    result.loyaltyDetected = loyaltyKeywords.some(kw => pageText.includes(kw))

    result.appDetected = !!$(
      'a[href*="apps.apple.com"], a[href*="play.google.com"], a[href*="itunes.apple.com"]'
    ).length
  } catch {
    result.error = result.error || 'HTML-Parsing teilweise fehlgeschlagen'
  }

  result.scrapeDurationMs = Date.now() - start
  return result
}

// ─── Logo Candidate Extraction (12 sources) ───────────────

const LOGO_KEYWORDS = [
  'logo', 'brand', 'marke', 'custom-logo', 'site-logo', 'navbar-brand',
  'site-branding', 'et_pb_logo', 'elementor-widget-theme-site-logo',
  'jtpl-logo', 'masthead',
]

async function extractLogoCandidates(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  html: string
): Promise<LogoCandidate[]> {
  const candidates: LogoCandidate[] = []
  candidates.push(...extractImgLogos($, baseUrl))
  candidates.push(...extractInlineSVGLogos($))
  candidates.push(...extractCSSBackgroundLogos($, baseUrl, html))
  candidates.push(...extractLinkLogos($, baseUrl))
  candidates.push(...extractMetaLogos($, baseUrl))
  candidates.push(...extractJsonLdLogos($, baseUrl))
  candidates.push(...extractFooterLogos($, baseUrl))
  // Manifest is async — fetch with short timeout
  try {
    candidates.push(...await extractManifestIcons($, baseUrl))
  } catch { /* manifest fetch failed, non-fatal */ }
  candidates.push(...extractFaviconFallback(baseUrl, candidates))
  return deduplicateAndBoost(candidates)
}

// ─── Source 1: <img> with logo keywords + first header/nav img ──

function extractImgLogos($: cheerio.CheerioAPI, baseUrl: string): LogoCandidate[] {
  const candidates: LogoCandidate[] = []
  const seenUrls = new Set<string>()
  let firstHeaderNavImg: string | null = null

  $('img').each((_, el) => {
    // Extended lazy-loading attributes
    const src = $(el).attr('src') || $(el).attr('data-src') ||
      $(el).attr('data-lazy-src') || $(el).attr('data-original')
    if (!src) return
    const url = resolveUrl(src, baseUrl)
    if (!url || seenUrls.has(url)) return
    if (url.includes('1x1') || url.includes('pixel')) return
    // Allow data: URIs for inline images but skip tiny tracking pixels
    if (url.startsWith('data:') && !url.startsWith('data:image/svg') && !url.startsWith('data:image/png') && !url.startsWith('data:image/jpeg')) return

    const alt = ($(el).attr('alt') || '').toLowerCase()
    const cls = ($(el).attr('class') || '').toLowerCase()
    const id = ($(el).attr('id') || '').toLowerCase()
    const srcLower = src.toLowerCase()
    const parentCls = ($(el).parent().attr('class') || '').toLowerCase()
    const parentId = ($(el).parent().attr('id') || '').toLowerCase()
    // Also check grandparent — common pattern: <div class="logo"><a><img></a></div>
    const grandparentCls = ($(el).parent().parent().attr('class') || '').toLowerCase()
    const grandparentId = ($(el).parent().parent().attr('id') || '').toLowerCase()

    const inHeaderNav = $(el).closest('header, nav, [class*="header"], [class*="navbar"]').length > 0

    if (inHeaderNav && !firstHeaderNavImg) {
      firstHeaderNavImg = url
    }

    const hasLogoHint = LOGO_KEYWORDS.some(kw =>
      srcLower.includes(kw) || alt.includes(kw) || cls.includes(kw) ||
      id.includes(kw) || parentCls.includes(kw) || parentId.includes(kw) ||
      grandparentCls.includes(kw) || grandparentId.includes(kw)
    )

    if (hasLogoHint) {
      seenUrls.add(url)
      const srcHasLogo = srcLower.includes('logo')
      candidates.push({
        url,
        source: 'header-logo',
        width: null,
        height: null,
        score: srcHasLogo ? 95 : (inHeaderNav ? 92 : 80),
      })
    }
  })

  // Also check <noscript> for lazy-loaded images
  $('noscript').each((_, el) => {
    const noscriptHtml = $(el).html()
    if (!noscriptHtml) return
    const $inner = cheerio.load(noscriptHtml)
    $inner('img').each((_, img) => {
      const src = $inner(img).attr('src')
      if (!src) return
      const url = resolveUrl(src, baseUrl)
      if (!url || seenUrls.has(url)) return
      const srcLower = src.toLowerCase()
      if (LOGO_KEYWORDS.some(kw => srcLower.includes(kw))) {
        seenUrls.add(url)
        candidates.push({ url, source: 'header-logo', width: null, height: null, score: 85 })
      }
    })
  })

  // Also check <picture> elements (modern responsive images)
  $('picture').each((_, el) => {
    const inHeaderNav = $(el).closest('header, nav, [class*="header"], [class*="navbar"]').length > 0
    const cls = ($(el).attr('class') || '').toLowerCase()
    const parentCls = ($(el).parent().attr('class') || '').toLowerCase()
    const hasLogoHint = LOGO_KEYWORDS.some(kw => cls.includes(kw) || parentCls.includes(kw))

    if (hasLogoHint || inHeaderNav) {
      // Get best source
      const sources = $(el).find('source')
      sources.each((_, src) => {
        const srcset = $(src).attr('srcset')
        if (!srcset) return
        const firstSrc = srcset.split(',')[0].trim().split(' ')[0]
        const url = resolveUrl(firstSrc, baseUrl)
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url)
          candidates.push({
            url,
            source: 'picture',
            width: null,
            height: null,
            score: hasLogoHint ? 93 : 86,
          })
        }
      })
    }
  })

  // Fallback: first img in header/nav
  if (firstHeaderNavImg && !seenUrls.has(firstHeaderNavImg)) {
    candidates.push({
      url: firstHeaderNavImg,
      source: 'header-logo',
      width: null,
      height: null,
      score: 88,
    })
  }

  return candidates
}

// ─── Source 2: Inline SVGs in logo containers ──

function extractInlineSVGLogos($: cheerio.CheerioAPI): LogoCandidate[] {
  const candidates: LogoCandidate[] = []

  // SVGs in elements with logo-related classes or in header/nav
  const selectors = [
    'header svg', 'nav svg',
    '[class*="logo"] svg', '[id*="logo"] svg',
    '.navbar-brand svg', '.site-branding svg', '.masthead svg',
  ]

  const seen = new Set<string>()

  $(selectors.join(', ')).each((_, el) => {
    const svgEl = $(el)
    // Skip tiny icon SVGs (simple icons usually have few paths)
    const viewBox = svgEl.attr('viewBox') || ''
    const paths = svgEl.find('path, polygon, rect, circle, ellipse, text').length
    if (paths < 2 && !svgEl.find('text').length) return // Too simple, likely an icon

    // Check viewBox dimensions if available
    const vbParts = viewBox.split(/[\s,]+/)
    if (vbParts.length === 4) {
      const w = parseFloat(vbParts[2])
      const h = parseFloat(vbParts[3])
      if (w < 16 || h < 16) return // Too small
    }

    // Serialize SVG to data URI
    const outerHtml = $.html(el)
    if (!outerHtml || outerHtml.length < 50) return // Too small to be a logo

    const encoded = Buffer.from(outerHtml).toString('base64')
    const dataUri = `data:image/svg+xml;base64,${encoded}`

    // Deduplicate by first 100 chars of SVG
    const key = outerHtml.substring(0, 100)
    if (seen.has(key)) return
    seen.add(key)

    const inLogoContainer = svgEl.closest('[class*="logo"], [id*="logo"], .navbar-brand').length > 0
    candidates.push({
      url: dataUri,
      source: 'inline-svg',
      width: null,
      height: null,
      score: inLogoContainer ? 91 : 85,
    })
  })

  return candidates
}

// ─── Source 3: CSS background-image logos ──

function extractCSSBackgroundLogos($: cheerio.CheerioAPI, baseUrl: string, html: string): LogoCandidate[] {
  const candidates: LogoCandidate[] = []
  const bgUrlRegex = /background(?:-image)?\s*:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g

  // 1. Scan inline style attributes on elements with logo classes
  const logoSelectors = [
    '[class*="logo"]', '[id*="logo"]',
    '.navbar-brand', '.site-branding', '.masthead',
    '.et_pb_logo', '[class*="custom-logo"]',
  ]

  $(logoSelectors.join(', ')).each((_, el) => {
    const style = $(el).attr('style') || ''
    const match = /background(?:-image)?\s*:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i.exec(style)
    if (match) {
      const url = resolveUrl(match[1], baseUrl)
      if (url && !url.startsWith('data:image/gif')) {
        const inHeaderNav = $(el).closest('header, nav').length > 0
        candidates.push({
          url,
          source: 'css-background',
          width: null,
          height: null,
          score: inHeaderNav ? 90 : 78,
        })
      }
    }

    // Also check data-bg attribute (lazy background loaders)
    const dataBg = $(el).attr('data-bg') || $(el).attr('data-background')
    if (dataBg) {
      const url = resolveUrl(dataBg, baseUrl)
      if (url) {
        candidates.push({ url, source: 'css-background', width: null, height: null, score: 80 })
      }
    }
  })

  // 2. Scan <style> blocks for logo-related selectors with background-image
  $('style').each((_, el) => {
    const css = $(el).html() || ''
    // Find rules containing logo keywords AND background-image
    const ruleRegex = /([^{}]+)\{([^}]*background(?:-image)?\s*:\s*url\([^)]+\)[^}]*)\}/gi
    let ruleMatch
    while ((ruleMatch = ruleRegex.exec(css)) !== null) {
      const selector = ruleMatch[1].toLowerCase()
      const body = ruleMatch[2]
      const hasLogoSelector = LOGO_KEYWORDS.some(kw => selector.includes(kw))
      if (!hasLogoSelector) continue

      const urlMatch = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i.exec(body)
      if (urlMatch) {
        const url = resolveUrl(urlMatch[1], baseUrl)
        if (url && !url.startsWith('data:image/gif')) {
          const inHeader = selector.includes('header') || selector.includes('nav')
          candidates.push({
            url,
            source: 'css-background',
            width: null,
            height: null,
            score: inHeader ? 90 : 78,
          })
        }
      }
    }
  })

  return candidates
}

// ─── Source 4: Link icons (apple-touch, icon, mask-icon, SVG icon) ──

function extractLinkLogos($: cheerio.CheerioAPI, baseUrl: string): LogoCandidate[] {
  const candidates: LogoCandidate[] = []

  // Apple Touch Icon
  $('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    const url = resolveUrl(href, baseUrl)
    if (!url) return
    const sizes = $(el).attr('sizes')
    const size = sizes ? parseInt(sizes.split('x')[0]) : 180
    const isPrecomposed = $(el).attr('rel') === 'apple-touch-icon-precomposed'
    const isSvg = url.toLowerCase().endsWith('.svg')
    let score = isPrecomposed ? 85 : 90
    if (isSvg) score = 60
    candidates.push({ url, source: 'apple-touch-icon', width: size, height: size, score })
  })

  // Link icons with type/sizes
  $('link[rel="icon"]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    const url = resolveUrl(href, baseUrl)
    if (!url) return
    const sizes = $(el).attr('sizes')
    const size = sizes ? parseInt(sizes.split('x')[0]) : null
    const type = ($(el).attr('type') || '').toLowerCase()
    const isSvg = type === 'image/svg+xml' || url.toLowerCase().endsWith('.svg')

    let score = 50
    if (isSvg) score = 78 // SVG favicons are higher quality
    else if (size && size >= 128) score = 75
    else if (size && size >= 64) score = 60
    else if (size && size < 64) score = 35
    candidates.push({ url, source: 'link-icon', width: size, height: size, score })
  })

  // Shortcut icon
  $('link[rel="shortcut icon"]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    const url = resolveUrl(href, baseUrl)
    if (url) {
      candidates.push({ url, source: 'link-icon', width: null, height: null, score: 40 })
    }
  })

  // Mask icon (Safari pinned tab)
  $('link[rel="mask-icon"]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    const url = resolveUrl(href, baseUrl)
    if (url) {
      candidates.push({ url, source: 'mask-icon', width: null, height: null, score: 45 })
    }
  })

  return candidates
}

// ─── Source 5: Meta images (OG, Twitter) ──

function extractMetaLogos($: cheerio.CheerioAPI, baseUrl: string): LogoCandidate[] {
  const candidates: LogoCandidate[] = []

  const ogImage = $('meta[property="og:image"]').attr('content')
  if (ogImage) {
    const url = resolveUrl(ogImage, baseUrl)
    if (url) {
      candidates.push({ url, source: 'og-image', width: null, height: null, score: 65 })
    }
  }

  const twitterImage = $('meta[name="twitter:image"], meta[property="twitter:image"]').attr('content')
  if (twitterImage) {
    const url = resolveUrl(twitterImage, baseUrl)
    if (url) {
      candidates.push({ url, source: 'meta-image', width: null, height: null, score: 55 })
    }
  }

  return candidates
}

// ─── Source 6: JSON-LD logo property ──

function extractJsonLdLogos($: cheerio.CheerioAPI, baseUrl: string): LogoCandidate[] {
  const candidates: LogoCandidate[] = []

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '')
      if (!data) return
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        // logo property (string or {url: "..."})
        if (item.logo) {
          const logoUrl = typeof item.logo === 'string'
            ? item.logo
            : (item.logo?.url || item.logo?.['@id'] || null)
          if (logoUrl) {
            const url = resolveUrl(logoUrl, baseUrl)
            if (url) {
              candidates.push({ url, source: 'structured-data', width: null, height: null, score: 87 })
            }
          }
        }
        // image as fallback
        if (item.image && !item.logo) {
          const imageUrl = typeof item.image === 'string'
            ? item.image
            : (Array.isArray(item.image) ? item.image[0] : item.image?.url)
          if (imageUrl && typeof imageUrl === 'string') {
            const url = resolveUrl(imageUrl, baseUrl)
            if (url) {
              candidates.push({ url, source: 'structured-data', width: null, height: null, score: 62 })
            }
          }
        }
      }
    } catch { /* broken JSON-LD */ }
  })

  return candidates
}

// ─── Source 7: Footer logos ──

function extractFooterLogos($: cheerio.CheerioAPI, baseUrl: string): LogoCandidate[] {
  const candidates: LogoCandidate[] = []
  const seen = new Set<string>()

  $('footer img, [class*="footer"] img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src')
    if (!src) return
    const url = resolveUrl(src, baseUrl)
    if (!url || seen.has(url)) return
    if (url.startsWith('data:image/gif') || url.includes('1x1')) return
    seen.add(url)

    const srcLower = src.toLowerCase()
    const alt = ($(el).attr('alt') || '').toLowerCase()
    const cls = ($(el).attr('class') || '').toLowerCase()
    const parentCls = ($(el).parent().attr('class') || '').toLowerCase()

    const hasLogoHint = LOGO_KEYWORDS.some(kw =>
      srcLower.includes(kw) || alt.includes(kw) || cls.includes(kw) || parentCls.includes(kw)
    )

    candidates.push({
      url,
      source: 'footer-logo',
      width: null,
      height: null,
      score: hasLogoHint ? 72 : 55,
    })
  })

  return candidates
}

// ─── Source 8: manifest.json icons ──

async function extractManifestIcons($: cheerio.CheerioAPI, baseUrl: string): Promise<LogoCandidate[]> {
  const candidates: LogoCandidate[] = []

  const manifestHref = $('link[rel="manifest"]').attr('href')
  if (!manifestHref) return candidates

  const manifestUrl = resolveUrl(manifestHref, baseUrl)
  if (!manifestUrl) return candidates

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)

    const res = await fetch(manifestUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    })
    clearTimeout(timeout)

    if (!res.ok) return candidates

    const manifest = await res.json()
    if (!manifest.icons || !Array.isArray(manifest.icons)) return candidates

    for (const icon of manifest.icons) {
      if (!icon.src) continue
      const url = resolveUrl(icon.src, manifestUrl)
      if (!url) continue

      const sizes = icon.sizes || ''
      const size = sizes ? parseInt(sizes.split('x')[0]) : 0
      let score = 70
      if (size >= 512) score = 88
      else if (size >= 192) score = 82
      else if (size >= 128) score = 76

      candidates.push({
        url,
        source: 'manifest-icon',
        width: size || null,
        height: size || null,
        score,
      })
    }
  } catch { /* manifest fetch failed, non-fatal */ }

  return candidates
}

// ─── Source 9: Default favicon.ico fallback ──

function extractFaviconFallback(baseUrl: string, existing: LogoCandidate[]): LogoCandidate[] {
  const faviconUrl = resolveUrl('/favicon.ico', baseUrl)
  if (!faviconUrl) return []
  if (existing.some(c => c.url.endsWith('/favicon.ico'))) return []
  return [{
    url: faviconUrl,
    source: 'favicon',
    width: null,
    height: null,
    score: 25,
  }]
}

// ─── Deduplication + Multi-Source Score Boost ──

function deduplicateAndBoost(candidates: LogoCandidate[]): LogoCandidate[] {
  const urlMap = new Map<string, LogoCandidate[]>()

  for (const c of candidates) {
    // Normalize URL for dedup (strip trailing slash, protocol-agnostic)
    const normalized = c.url
      .replace(/^https?:\/\//, '//')
      .replace(/\/+$/, '')
      .replace(/\?.*$/, '') // strip query params for dedup
    const existing = urlMap.get(normalized) || []
    existing.push(c)
    urlMap.set(normalized, existing)
  }

  const result: LogoCandidate[] = []
  for (const [, dupes] of urlMap) {
    // Pick the highest-scored variant
    dupes.sort((a, b) => b.score - a.score)
    const best = { ...dupes[0] }

    // Multi-source boost: same URL found in 2+ sources = strong signal
    const uniqueSources = new Set(dupes.map(d => d.source))
    if (uniqueSources.size >= 2) {
      best.score = Math.min(best.score + 5, 99)
    }

    result.push(best)
  }

  return result
}

// ─── URL Helper ──

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}
