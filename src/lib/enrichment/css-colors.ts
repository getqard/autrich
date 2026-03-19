/**
 * CSS Brand Color Extraction Engine
 *
 * Extracts brand colors from HTML by parsing CSS custom properties,
 * meta tags, inline styles, and style block rules.
 */

// ─── Types ───────────────────────────────────────────────────

export type ColorCandidate = {
  hex: string
  role: 'background' | 'accent' | 'text' | 'border'
  source: string
  confidence: number
}

export type CSSColorResult = {
  backgroundColor: string | null
  accentColor: string | null
  headerBackground: string | null
  source: string | null
  confidence: number
  candidates: ColorCandidate[]
}

// ─── Color Parsing ───────────────────────────────────────────

function expandShortHex(hex: string): string {
  const h = hex.replace('#', '')
  if (h.length === 3) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`
  }
  if (h.length === 8) return `#${h.substring(0, 6)}`
  return `#${h.substring(0, 6)}`
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
  }
  return rgbToHex(f(0), f(8), f(4))
}

/**
 * Parse any CSS color value to 6-char hex lowercase. Returns null if unparseable or transparent.
 */
function parseCSSColor(value: string): string | null {
  const v = value.trim().toLowerCase()

  const namedColors: Record<string, string> = {
    red: '#ff0000', blue: '#0000ff', green: '#008000', orange: '#ffa500',
    purple: '#800080', navy: '#000080', teal: '#008080', maroon: '#800000',
    olive: '#808000', coral: '#ff7f50', crimson: '#dc143c', gold: '#ffd700',
    indigo: '#4b0082', tomato: '#ff6347', steelblue: '#4682b4',
    darkblue: '#00008b', darkgreen: '#006400', darkred: '#8b0000',
    darkorange: '#ff8c00', royalblue: '#4169e1', firebrick: '#b22222',
    forestgreen: '#228b22', midnightblue: '#191970', slategray: '#708090',
  }

  if (v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'unset' || v === 'currentcolor') {
    return null
  }
  if (namedColors[v]) return namedColors[v]

  // Hex
  const hexMatch = v.match(/^#([0-9a-f]{3,8})$/)
  if (hexMatch) {
    const hex = hexMatch[1]
    if (hex.length === 8) {
      const alpha = parseInt(hex.substring(6, 8), 16) / 255
      if (alpha < 0.5) return null
    }
    return expandShortHex(`#${hex}`)
  }

  // rgb/rgba — both comma and space syntax
  const rgbMatch = v.match(/rgba?\(\s*(\d+)\s*[,/\s]\s*(\d+)\s*[,/\s]\s*(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/)
  if (rgbMatch) {
    const alpha = rgbMatch[4]
      ? (rgbMatch[4].endsWith('%') ? parseFloat(rgbMatch[4]) / 100 : parseFloat(rgbMatch[4]))
      : 1
    if (alpha < 0.5) return null
    return rgbToHex(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]))
  }

  // hsl/hsla
  const hslMatch = v.match(/hsla?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%?\s*[,\s]\s*([\d.]+)%?(?:\s*[,/]\s*([\d.]+%?))?\s*\)/)
  if (hslMatch) {
    const alpha = hslMatch[4]
      ? (hslMatch[4].endsWith('%') ? parseFloat(hslMatch[4]) / 100 : parseFloat(hslMatch[4]))
      : 1
    if (alpha < 0.5) return null
    return hslToHex(parseFloat(hslMatch[1]), parseFloat(hslMatch[2]), parseFloat(hslMatch[3]))
  }

  return null
}

// ─── Filtering ───────────────────────────────────────────────

function isUselessColor(hex: string): boolean {
  const h = hex.replace('#', '').toLowerCase()
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  // Very light grays / near-white
  if (r >= 240 && g >= 240 && b >= 240) return true
  return false
}

function isNearBlack(hex: string): boolean {
  const h = hex.replace('#', '').toLowerCase()
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return r <= 15 && g <= 15 && b <= 15
}

function isNeutralGray(hex: string): boolean {
  const h = hex.replace('#', '').toLowerCase()
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  // Check if all channels are close to each other (gray-ish)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return (max - min) < 20
}

function colorSaturation(hex: string): number {
  const h = hex.replace('#', '').toLowerCase()
  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === 0) return 0
  return (max - min) / max
}

// ─── Extraction Sources ──────────────────────────────────────

function extractStyleBlocks(html: string): string {
  const blocks: string[] = []
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi
  let match
  while ((match = styleRegex.exec(html)) !== null) {
    blocks.push(match[1])
  }
  return blocks.join('\n')
}

/**
 * Extract external stylesheet URLs from <link rel="stylesheet"> tags.
 * Prioritizes theme/brand stylesheets over framework CSS.
 */
function extractStylesheetUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = []
  const linkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi
  const linkRegex2 = /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/gi

  for (const regex of [linkRegex, linkRegex2]) {
    let match
    while ((match = regex.exec(html)) !== null) {
      try {
        const url = new URL(match[1], baseUrl).href
        if (!urls.includes(url)) urls.push(url)
      } catch { /* invalid URL */ }
    }
  }

  // Sort: prioritize likely brand/theme CSS over generic framework CSS
  const priorityKeywords = ['style', 'theme', 'custom', 'elementor', 'astra', 'divi', 'main', 'global', 'brand']
  const deprioritize = ['wp-includes', 'jquery', 'font', 'dashicons', 'admin', 'gutenberg', 'block-library', 'woocommerce']

  return urls.sort((a, b) => {
    const aLower = a.toLowerCase()
    const bLower = b.toLowerCase()
    const aSkip = deprioritize.some(kw => aLower.includes(kw))
    const bSkip = deprioritize.some(kw => bLower.includes(kw))
    if (aSkip && !bSkip) return 1
    if (!aSkip && bSkip) return -1
    const aPrio = priorityKeywords.some(kw => aLower.includes(kw))
    const bPrio = priorityKeywords.some(kw => bLower.includes(kw))
    if (aPrio && !bPrio) return -1
    if (!aPrio && bPrio) return 1
    return 0
  })
}

/**
 * Fetch external CSS files and return combined CSS text.
 * Fetches top N stylesheets with short timeouts.
 */
async function fetchExternalCSS(urls: string[], maxFiles: number = 5, maxSizePerFile: number = 200_000): Promise<string> {
  const blocks: string[] = []

  const toFetch = urls.slice(0, maxFiles)
  const results = await Promise.allSettled(
    toFetch.map(async (url) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        })
        clearTimeout(timeout)
        if (!res.ok) return ''
        const contentType = res.headers.get('content-type') || ''
        if (contentType.includes('html')) return '' // not CSS
        const text = await res.text()
        return text.substring(0, maxSizePerFile)
      } catch {
        clearTimeout(timeout)
        return ''
      }
    })
  )

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      blocks.push(r.value)
    }
  }

  return blocks.join('\n')
}

// Known WordPress default palette colors (should not be treated as brand colors)
const WP_DEFAULT_COLORS = new Set([
  '#000000', '#ffffff', '#abb8c3', '#f78da7', '#cf2e2e',
  '#ff6900', '#fcb900', '#7bdcb5', '#00d084', '#8ed1fc',
  '#0693e3', '#9b51e0',
])

/**
 * Source 1a: CSS Custom Properties
 */
function extractFromCSSVars(css: string): ColorCandidate[] {
  const candidates: ColorCandidate[] = []

  // High-confidence named patterns (Elementor, Astra, Divi, Squarespace, generic)
  const namedPatterns: Array<{ regex: RegExp; role: ColorCandidate['role']; label: string; confidence: number }> = [
    // Elementor
    { regex: /--e-global-color-primary\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'elementor-primary', confidence: 0.95 },
    { regex: /--e-global-color-secondary\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'elementor-secondary', confidence: 0.9 },
    { regex: /--e-global-color-accent\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'elementor-accent', confidence: 0.9 },
    { regex: /--e-global-color-text\s*:\s*([^;}\n]+)/gi, role: 'text', label: 'elementor-text', confidence: 0.85 },
    // Astra
    { regex: /--ast-global-color-0\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'astra-primary', confidence: 0.93 },
    { regex: /--ast-global-color-1\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'astra-accent', confidence: 0.9 },
    // Divi
    { regex: /--primary_color\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'divi-primary', confidence: 0.93 },
    { regex: /--secondary_color\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'divi-secondary', confidence: 0.9 },
    // Squarespace
    { regex: /--primaryButtonColor\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'squarespace-button', confidence: 0.9 },
    { regex: /--accentColor\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'squarespace-accent', confidence: 0.9 },
    { regex: /--siteBackgroundColor\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'squarespace-bg', confidence: 0.9 },
    // Generic
    { regex: /--(?:brand|primary|main)[-_]?color\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'generic-primary', confidence: 0.93 },
    { regex: /--accent[-_]?color\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'generic-accent', confidence: 0.9 },
    { regex: /--header[-_]bg\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'generic-header-bg', confidence: 0.88 },
    // WordPress specific
    { regex: /--wp--preset--color--primary\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'wp-primary', confidence: 0.93 },
    { regex: /--wp--preset--color--secondary\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'wp-secondary', confidence: 0.9 },
  ]

  for (const { regex, role, label, confidence } of namedPatterns) {
    let match
    while ((match = regex.exec(css)) !== null) {
      const hex = parseCSSColor(match[1])
      if (hex && !isUselessColor(hex)) {
        candidates.push({ hex, role, source: `css-var:${label}`, confidence })
      }
    }
  }

  // WordPress preset colors — collect ALL custom (non-default) palette entries
  // These are theme-specific additions beyond the WordPress defaults
  const wpPresetRegex = /--wp--preset--color--([\w-]+)\s*:\s*([^;}\n]+)/gi
  let wpMatch
  while ((wpMatch = wpPresetRegex.exec(css)) !== null) {
    const name = wpMatch[1]
    const hex = parseCSSColor(wpMatch[2])
    if (!hex || isUselessColor(hex)) continue
    // Skip standard WordPress palette
    if (WP_DEFAULT_COLORS.has(hex.toLowerCase())) continue
    // Skip if already captured by named patterns
    if (candidates.some(c => c.hex === hex)) continue

    candidates.push({
      hex,
      role: colorSaturation(hex) > 0.3 ? 'accent' : 'background',
      source: `css-var:wp-preset-${name}`,
      confidence: 0.82,
    })
  }

  return candidates
}

/**
 * Source 1b: <meta name="theme-color"> / msapplication-TileColor
 */
function extractFromMetaTags(html: string): ColorCandidate[] {
  const candidates: ColorCandidate[] = []

  const themeColorMatch = html.match(/<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']theme-color["']/i)
  if (themeColorMatch) {
    const hex = parseCSSColor(themeColorMatch[1])
    if (hex && !isUselessColor(hex)) {
      candidates.push({ hex, role: 'background', source: 'meta:theme-color', confidence: 0.9 })
    }
  }

  const tileColorMatch = html.match(/<meta[^>]*name=["']msapplication-TileColor["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']msapplication-TileColor["']/i)
  if (tileColorMatch) {
    const hex = parseCSSColor(tileColorMatch[1])
    if (hex && !isUselessColor(hex)) {
      candidates.push({ hex, role: 'background', source: 'meta:msapplication-TileColor', confidence: 0.88 })
    }
  }

  return candidates
}

/**
 * Source 1c: Inline styles on ANY element + Elementor data-settings
 */
function extractFromInlineStyles(html: string): ColorCandidate[] {
  const candidates: ColorCandidate[] = []

  // Match ALL style="" attributes in the HTML and look for background-color
  const styleAttrRegex = /style=["']([^"']*background[^"']*)["']/gi
  let match
  while ((match = styleAttrRegex.exec(html)) !== null) {
    const style = match[1]
    const bgMatch = style.match(/background-color\s*:\s*([^;]+)/i)
      || style.match(/background\s*:\s*(#[0-9a-fA-F]{3,8}|rgb[a(]?[^;)]+\)?)/i)
    if (bgMatch) {
      const hex = parseCSSColor(bgMatch[1].trim().split(/\s/)[0])
      if (hex && !isUselessColor(hex)) {
        // Check if it's on a structural element for higher confidence
        // Look backwards in HTML to see what tag this is on
        const before = html.substring(Math.max(0, match.index - 200), match.index)
        const tagMatch = before.match(/<(header|nav|footer|section|div|main|body)[^>]*$/i)
        const isStructural = tagMatch && ['header', 'nav', 'footer', 'section', 'body', 'main'].includes(tagMatch[1].toLowerCase())
        candidates.push({
          hex,
          role: 'background',
          source: isStructural ? `inline:${tagMatch![1]}` : 'inline:element',
          confidence: isStructural ? 0.78 : 0.6,
        })
      }
    }
  }

  // Elementor data-settings JSON (HTML entity encoded)
  const dataSettingsRegex = /data-settings=["']([\s\S]*?)["']/gi
  while ((match = dataSettingsRegex.exec(html)) !== null) {
    try {
      const raw = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
      // Only parse if it looks like JSON
      if (!raw.startsWith('{')) continue
      const settings = JSON.parse(raw)
      const colorFields = ['background_color', 'background_overlay_color', 'btn_bg_color', 'title_color']
      for (const field of colorFields) {
        if (settings[field]) {
          const hex = parseCSSColor(settings[field])
          if (hex && !isUselessColor(hex)) {
            const role = field.includes('overlay') || field.includes('btn') ? 'accent' as const : 'background' as const
            candidates.push({ hex, role, source: `elementor:${field}`, confidence: 0.78 })
          }
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return candidates
}

/**
 * Source 1d: ALL background-color declarations in style blocks
 * Simple broad scan — catches things the selector-based approach misses
 */
function extractFromStyleRules(css: string): ColorCandidate[] {
  const candidates: ColorCandidate[] = []

  // Broad scan: find ALL background-color values in CSS
  const bgColorRegex = /background-color\s*:\s*([^;!}\n]+)/gi
  let match
  while ((match = bgColorRegex.exec(css)) !== null) {
    const raw = match[1].trim()
    // Skip var() references — those are handled by CSS var extraction
    if (raw.startsWith('var(')) continue
    const hex = parseCSSColor(raw)
    if (hex && !isUselessColor(hex)) {
      // Check context: look backwards to find selector
      const before = css.substring(Math.max(0, match.index - 300), match.index)
      const selectorMatch = before.match(/([^{}]+)\{[^{}]*$/)
      const selector = selectorMatch ? selectorMatch[1].trim() : ''

      const isStructural = /(?:body|header|nav|footer|\.header|\.navbar|\.site-header|\.main-header|#masthead|#header|\.hero|\.top-bar|\.footer)/i.test(selector)
      const isButton = /(?:\.btn|\.button|\.cta|a\b|\.wp-block-button)/i.test(selector)

      if (isButton) {
        candidates.push({
          hex,
          role: 'accent',
          source: `css-rule:${selector.substring(selector.length - 40).trim()}`,
          confidence: isNearBlack(hex) ? 0.55 : 0.68,
        })
      } else {
        candidates.push({
          hex,
          role: 'background',
          source: isStructural
            ? `css-rule:${selector.substring(selector.length - 40).trim()}`
            : `css-rule:background`,
          confidence: isStructural
            ? (isNearBlack(hex) ? 0.6 : 0.75)
            : (isNearBlack(hex) ? 0.5 : 0.58),
        })
      }
    }
  }

  // Also scan for `color:` on structural elements (text color)
  const colorRegex = /(?:body|header|nav|\.header|\.site-header|#masthead)\s*[^{]*\{[^}]*?(?:^|;)\s*color\s*:\s*([^;!}\n]+)/gim
  while ((match = colorRegex.exec(css)) !== null) {
    const hex = parseCSSColor(match[1].trim())
    if (hex && !isUselessColor(hex) && !isNearBlack(hex)) {
      candidates.push({ hex, role: 'text', source: 'css-rule:text', confidence: 0.5 })
    }
  }

  return candidates
}

// ─── Header Background Extraction ────────────────────────────

/**
 * Extract the background color of the header/nav element.
 * This is where the logo sits — highest-confidence brand signal.
 */
function extractHeaderBackground(html: string, css: string): ColorCandidate | null {
  // 1. CSS variables for header bg
  const headerVarPatterns = [
    /--header[-_]bg(?:[-_]color)?\s*:\s*([^;}\n]+)/i,
    /--navbar[-_]bg(?:[-_]color)?\s*:\s*([^;}\n]+)/i,
    /--nav[-_]bg(?:[-_]color)?\s*:\s*([^;}\n]+)/i,
    /--header[-_]background(?:[-_]color)?\s*:\s*([^;}\n]+)/i,
  ]

  for (const pattern of headerVarPatterns) {
    const match = css.match(pattern)
    if (match) {
      const hex = parseCSSColor(match[1])
      if (hex && !isUselessColor(hex)) {
        return { hex, role: 'background', source: 'header-var', confidence: 0.97 }
      }
    }
  }

  // 2. Inline style on <header> or <nav> tags
  const inlineHeaderPatterns = [
    /<header[^>]*style=["']([^"']*background[^"']*)["']/gi,
    /<nav[^>]*style=["']([^"']*background[^"']*)["']/gi,
  ]

  for (const pattern of inlineHeaderPatterns) {
    let match
    while ((match = pattern.exec(html)) !== null) {
      const style = match[1]
      const bgMatch = style.match(/background-color\s*:\s*([^;]+)/i)
        || style.match(/background\s*:\s*(#[0-9a-fA-F]{3,8}|rgb[a(]?[^;)]+\)?)/i)
      if (bgMatch) {
        const hex = parseCSSColor(bgMatch[1].trim().split(/\s/)[0])
        if (hex && !isUselessColor(hex)) {
          return { hex, role: 'background', source: 'inline:header', confidence: 0.97 }
        }
      }
    }
  }

  // 3. CSS rules targeting header/nav elements
  const headerSelectors = /(?:^|[,}\s])(header|nav|\.header|\.navbar|\.site-header|#header|#masthead|\.main-header|\.nav-wrapper|\.top-bar)\s*[^{]*\{([^}]*)\}/gim
  let ruleMatch
  while ((ruleMatch = headerSelectors.exec(css)) !== null) {
    const body = ruleMatch[2]
    const bgMatch = body.match(/background-color\s*:\s*([^;!}\n]+)/i)
      || body.match(/background\s*:\s*(#[0-9a-fA-F]{3,8}|rgb[a(]?[^;)]+\)?)/i)
    if (bgMatch) {
      const raw = bgMatch[1].trim()
      if (raw.startsWith('var(')) continue
      const hex = parseCSSColor(raw.split(/\s/)[0])
      if (hex && !isUselessColor(hex)) {
        return { hex, role: 'background', source: `css-rule:${ruleMatch[1].trim()}`, confidence: 0.97 }
      }
    }
  }

  // 4. Elementor data-settings on header containers
  const headerDataMatch = html.match(/<(?:header|nav)[^>]*data-settings=["']([\s\S]*?)["']/i)
  if (headerDataMatch) {
    try {
      const raw = headerDataMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&amp;/g, '&')
      if (raw.startsWith('{')) {
        const settings = JSON.parse(raw)
        if (settings.background_color) {
          const hex = parseCSSColor(settings.background_color)
          if (hex && !isUselessColor(hex)) {
            return { hex, role: 'background', source: 'elementor:header-bg', confidence: 0.97 }
          }
        }
      }
    } catch { /* invalid JSON */ }
  }

  return null
}

// ─── Main Extraction ─────────────────────────────────────────

export async function extractBrandColors(html: string, baseUrl?: string): Promise<CSSColorResult> {
  const inlineCSS = extractStyleBlocks(html)

  // Fetch external stylesheets for much better color detection
  let externalCSS = ''
  if (baseUrl) {
    try {
      const sheetUrls = extractStylesheetUrls(html, baseUrl)
      if (sheetUrls.length > 0) {
        console.log(`[CSS Colors] Fetching ${Math.min(sheetUrls.length, 5)} of ${sheetUrls.length} external stylesheets`)
        externalCSS = await fetchExternalCSS(sheetUrls)
        console.log(`[CSS Colors] External CSS: ${(externalCSS.length / 1024).toFixed(0)}KB`)
      }
    } catch {
      // External CSS fetch failed, continue with inline only
    }
  }

  const css = inlineCSS + '\n' + externalCSS

  const allCandidates: ColorCandidate[] = [
    ...extractFromCSSVars(css),
    ...extractFromMetaTags(html),
    ...extractFromInlineStyles(html),
    ...extractFromStyleRules(css),
  ]

  // Extract header background separately (highest confidence signal)
  const headerBg = extractHeaderBackground(html, css)

  // Deduplicate by hex (keep highest confidence per hex)
  const byHex = new Map<string, ColorCandidate>()
  for (const c of allCandidates) {
    const key = c.hex.toLowerCase()
    const existing = byHex.get(key)
    if (!existing || c.confidence > existing.confidence) {
      byHex.set(key, c)
    }
  }
  const candidates = Array.from(byHex.values()).sort((a, b) => b.confidence - a.confidence)

  // Pick best background: prefer saturated/colorful over grays/blacks
  const bgCandidates = candidates.filter(c => c.role === 'background')
  const colorfulBg = bgCandidates.find(c => !isNearBlack(c.hex) && !isNeutralGray(c.hex))
  const bestBg = colorfulBg || bgCandidates.find(c => !isNearBlack(c.hex)) || bgCandidates[0] || null

  // Pick best accent (different from bg, prefer saturated colors)
  const accentCandidates = candidates.filter(c =>
    (c.role === 'accent' || c.role === 'border') && c.hex !== bestBg?.hex
  )
  let bestAccent = accentCandidates.find(c => colorSaturation(c.hex) > 0.3)
    || accentCandidates[0]
    || null

  // If no accent from accent-role, try colorful bg candidates as accent
  if (!bestAccent) {
    const otherColorful = bgCandidates.find(c =>
      c.hex !== bestBg?.hex && colorSaturation(c.hex) > 0.3
    )
    if (otherColorful) {
      bestAccent = { ...otherColorful, role: 'accent' }
    }
  }

  return {
    backgroundColor: bestBg?.hex ?? null,
    accentColor: bestAccent?.hex ?? null,
    headerBackground: headerBg?.hex ?? null,
    source: bestBg?.source ?? null,
    confidence: bestBg?.confidence ?? 0,
    candidates,
  }
}
