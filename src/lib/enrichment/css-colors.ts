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
  context?: string
  element?: string
  property?: string
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
async function fetchExternalCSS(urls: string[], maxFiles: number = 10, maxSizePerFile: number = 200_000): Promise<string> {
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
  const namedPatterns: Array<{ regex: RegExp; role: ColorCandidate['role']; label: string; confidence: number; context: string }> = [
    // Elementor
    { regex: /--e-global-color-primary\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'elementor-primary', confidence: 0.95, context: 'Elementor Hauptfarbe (Primary)' },
    { regex: /--e-global-color-secondary\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'elementor-secondary', confidence: 0.9, context: 'Elementor Zweitfarbe (Secondary)' },
    { regex: /--e-global-color-accent\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'elementor-accent', confidence: 0.9, context: 'Elementor Akzentfarbe' },
    { regex: /--e-global-color-text\s*:\s*([^;}\n]+)/gi, role: 'text', label: 'elementor-text', confidence: 0.85, context: 'Elementor Textfarbe' },
    // Astra
    { regex: /--ast-global-color-0\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'astra-primary', confidence: 0.93, context: 'Astra Theme Hauptfarbe' },
    { regex: /--ast-global-color-1\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'astra-accent', confidence: 0.9, context: 'Astra Theme Akzentfarbe' },
    // Divi
    { regex: /--primary_color\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'divi-primary', confidence: 0.93, context: 'Divi Hauptfarbe' },
    { regex: /--secondary_color\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'divi-secondary', confidence: 0.9, context: 'Divi Zweitfarbe' },
    // Squarespace
    { regex: /--primaryButtonColor\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'squarespace-button', confidence: 0.9, context: 'Squarespace Button-Farbe' },
    { regex: /--accentColor\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'squarespace-accent', confidence: 0.9, context: 'Squarespace Akzentfarbe' },
    { regex: /--siteBackgroundColor\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'squarespace-bg', confidence: 0.9, context: 'Squarespace Seitenhintergrund' },
    // Shopify
    { regex: /--color-base-accent-1\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'shopify-accent', confidence: 0.90, context: 'Shopify Akzentfarbe' },
    { regex: /--color-base-background-1\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'shopify-bg', confidence: 0.88, context: 'Shopify Hintergrundfarbe' },
    { regex: /--color-base-text\s*:\s*([^;}\n]+)/gi, role: 'text', label: 'shopify-text', confidence: 0.85, context: 'Shopify Textfarbe' },
    // Webflow
    { regex: /--swatch[-_]([a-zA-Z0-9-]+)\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'webflow-swatch', confidence: 0.85, context: 'Webflow Farb-Swatch' },
    // Wix
    { regex: /--color[-_](\d+)\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'wix-color', confidence: 0.80, context: 'Wix Theme-Farbe' },
    // Generic
    { regex: /--(?:brand|primary|main)[-_]?color\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'generic-primary', confidence: 0.93, context: 'CSS-Variable: Marken-Hauptfarbe' },
    { regex: /--accent[-_]?color\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'generic-accent', confidence: 0.9, context: 'CSS-Variable: Akzentfarbe' },
    { regex: /--header[-_]bg\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'generic-header-bg', confidence: 0.88, context: 'CSS-Variable: Header-Hintergrund' },
    // WordPress specific
    { regex: /--wp--preset--color--primary\s*:\s*([^;}\n]+)/gi, role: 'background', label: 'wp-primary', confidence: 0.93, context: 'WordPress Hauptfarbe' },
    { regex: /--wp--preset--color--secondary\s*:\s*([^;}\n]+)/gi, role: 'accent', label: 'wp-secondary', confidence: 0.9, context: 'WordPress Zweitfarbe' },
  ]

  for (const { regex, role, label, confidence, context } of namedPatterns) {
    let match
    while ((match = regex.exec(css)) !== null) {
      const hex = parseCSSColor(match[1])
      if (hex && !isUselessColor(hex)) {
        candidates.push({ hex, role, source: `css-var:${label}`, confidence, context, property: match[0].split(':')[0].trim() })
      }
    }
  }

  // Elementor numbered palette (4-7 = custom designer colors, 0-3 already captured above)
  const elementorNumbered = /--e-global-color-(\d+)\s*:\s*([^;}\n]+)/gi
  let elMatch
  while ((elMatch = elementorNumbered.exec(css)) !== null) {
    const idx = parseInt(elMatch[1], 10)
    if (idx < 4 || idx > 7) continue // 0-3 already captured as primary/secondary/text/accent
    const hex = parseCSSColor(elMatch[2])
    if (!hex || isUselessColor(hex)) continue
    if (candidates.some(c => c.hex === hex)) continue
    const sat = colorSaturation(hex)
    candidates.push({
      hex,
      role: sat > 0.3 ? 'accent' : 'background',
      source: `css-var:elementor-palette-${idx}`,
      confidence: 0.88,
    })
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

// Common CSS framework colors — should not be treated as brand colors
const FRAMEWORK_COLORS = new Set([
  '#007bff', '#0d6efd', '#6c757d', '#28a745', '#198754',
  '#dc3545', '#ffc107', '#17a2b8', '#0dcaf0', '#5cb85c',
  '#d9534f', '#f0ad4e', '#5bc0de', '#0075ff',
])

/**
 * Source 1d: ALL color declarations in style blocks
 * Scans: background-color, color, border-color, fill, stroke, gradients
 */
function extractFromStyleRules(css: string): ColorCandidate[] {
  const candidates: ColorCandidate[] = []

  // Helper: get selector context for a match position
  function getSelectorAt(pos: number): string {
    const before = css.substring(Math.max(0, pos - 400), pos)
    const selectorMatch = before.match(/([^{}]+)\{[^{}]*$/)
    return selectorMatch ? selectorMatch[1].trim() : ''
  }

  function classifySelector(selector: string): { isStructural: boolean; isButton: boolean; isLink: boolean; isHeading: boolean } {
    return {
      isStructural: /(?:body|header|nav|footer|\.header|\.navbar|\.site-header|\.main-header|#masthead|#header|\.hero|\.top-bar|\.footer|section)/i.test(selector),
      isButton: /(?:\.btn|\.button|\.cta|\.wp-block-button|input\[type|submit)/i.test(selector),
      isLink: /(?:^a\b|\.link|\.nav-link|\.menu.*a\b)/i.test(selector),
      isHeading: /(?:^h[1-6]\b|\.title|\.heading)/i.test(selector),
    }
  }

  let match: RegExpExecArray | null

  // ─── 1. background-color ────────────────────────────────
  const bgColorRegex = /background-color\s*:\s*([^;!}\n]+)/gi
  while ((match = bgColorRegex.exec(css)) !== null) {
    const raw = match[1].trim()
    if (raw.startsWith('var(')) continue
    const hex = parseCSSColor(raw)
    if (!hex || isUselessColor(hex)) continue

    const selector = getSelectorAt(match.index)
    const ctx = classifySelector(selector)
    const frameworkPenalty = FRAMEWORK_COLORS.has(hex.toLowerCase()) ? 0.6 : 1.0

    const selectorShort = selector.substring(selector.length - 40).trim()
    if (ctx.isButton) {
      candidates.push({ hex, role: 'accent', source: `css-rule:${selectorShort}`, confidence: (isNearBlack(hex) ? 0.55 : 0.72) * frameworkPenalty, context: `Button-Hintergrund (${selectorShort})`, element: selectorShort, property: 'background-color' })
    } else {
      const conf = ctx.isStructural ? (isNearBlack(hex) ? 0.6 : 0.75) : (isNearBlack(hex) ? 0.5 : 0.58)
      const ctx_str = ctx.isStructural ? `Struktur-Hintergrund (${selectorShort})` : `Hintergrundfarbe (${selectorShort})`
      candidates.push({ hex, role: 'background', source: `css-rule:${selectorShort}`, confidence: conf * frameworkPenalty, context: ctx_str, element: selectorShort, property: 'background-color' })
    }
  }

  // ─── 2. color: (text color — key for accent detection) ──
  const colorRegex = /(?:^|;|\{)\s*color\s*:\s*([^;!}\n]+)/gi
  while ((match = colorRegex.exec(css)) !== null) {
    const raw = match[1].trim()
    if (raw.startsWith('var(') || raw.startsWith('inherit')) continue
    const hex = parseCSSColor(raw)
    if (!hex || isUselessColor(hex) || isNearBlack(hex)) continue
    // Skip near-white text colors (boring)
    if (isNeutralGray(hex)) continue

    const selector = getSelectorAt(match.index)
    const ctx = classifySelector(selector)
    const sat = colorSaturation(hex)
    const frameworkPenalty = FRAMEWORK_COLORS.has(hex.toLowerCase()) ? 0.6 : 1.0

    const selShort = selector.substring(selector.length - 40).trim()
    if ((ctx.isButton || ctx.isLink) && sat > 0.3) {
      candidates.push({ hex, role: 'accent', source: `css-color:${selShort}`, confidence: 0.75 * frameworkPenalty, context: `Textfarbe auf Button/Link (${selShort})`, element: selShort, property: 'color' })
    } else if (ctx.isHeading && sat > 0.2) {
      candidates.push({ hex, role: 'accent', source: `css-color:heading`, confidence: 0.65 * frameworkPenalty, context: 'Überschriften-Textfarbe', element: selShort, property: 'color' })
    } else if (ctx.isStructural && sat > 0.2) {
      candidates.push({ hex, role: 'text', source: `css-color:structural`, confidence: 0.55 * frameworkPenalty, context: 'Textfarbe in Struktur-Element', element: selShort, property: 'color' })
    } else if (sat > 0.4) {
      candidates.push({ hex, role: 'accent', source: `css-color:saturated`, confidence: 0.60 * frameworkPenalty, context: 'Farbige Textfarbe (hohe Sättigung)', element: selShort, property: 'color' })
    }
  }

  // ─── 3. border-color ────────────────────────────────────
  const borderRegex = /border(?:-(?:top|right|bottom|left))?-color\s*:\s*([^;!}\n]+)/gi
  while ((match = borderRegex.exec(css)) !== null) {
    const raw = match[1].trim()
    if (raw.startsWith('var(')) continue
    const hex = parseCSSColor(raw)
    if (!hex || isUselessColor(hex) || isNearBlack(hex) || isNeutralGray(hex)) continue
    const sat = colorSaturation(hex)
    if (sat < 0.2) continue

    candidates.push({ hex, role: 'border', source: 'css-border', confidence: 0.55 })
  }

  // ─── 4. Gradient color stops ────────────────────────────
  const gradientRegex = /(?:linear|radial)-gradient\s*\(([^)]+)\)/gi
  while ((match = gradientRegex.exec(css)) !== null) {
    const gradientBody = match[1]
    // Extract all color values from gradient stops
    const colorTokens = gradientBody.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/g)
    if (colorTokens) {
      for (const token of colorTokens) {
        const hex = parseCSSColor(token)
        if (!hex || isUselessColor(hex) || isNearBlack(hex)) continue
        const sat = colorSaturation(hex)
        if (sat < 0.15) continue
        candidates.push({ hex, role: 'accent', source: 'css-gradient', confidence: 0.62 })
      }
    }
  }

  // ─── 5. SVG fill/stroke ─────────────────────────────────
  const svgColorRegex = /(?:fill|stroke)\s*:\s*([^;!}\n]+)/gi
  while ((match = svgColorRegex.exec(css)) !== null) {
    const raw = match[1].trim()
    if (raw === 'none' || raw === 'currentColor' || raw.startsWith('url(') || raw.startsWith('var(')) continue
    const hex = parseCSSColor(raw)
    if (!hex || isUselessColor(hex) || isNearBlack(hex) || isNeutralGray(hex)) continue
    const sat = colorSaturation(hex)
    if (sat < 0.2) continue
    candidates.push({ hex, role: 'accent', source: 'css-svg-fill', confidence: 0.58 })
  }

  return candidates
}

/**
 * Source 1e: Tailwind arbitrary values + inline hex colors in HTML attributes
 * Catches: bg-[#hex], text-[#hex], border-[#hex], fill-[#hex], and data-color attributes
 */
function extractFromHTMLClasses(html: string): ColorCandidate[] {
  const candidates: ColorCandidate[] = []
  const seen = new Set<string>()

  // Tailwind arbitrary values: bg-[#xxx], text-[#xxx], border-[#xxx], fill-[#xxx]
  const twRegex = /(?:bg|text|border|fill|stroke|accent|ring|outline|decoration)-\[#([0-9a-fA-F]{3,8})\]/g
  let match
  while ((match = twRegex.exec(html)) !== null) {
    const hex = expandShortHex(`#${match[1]}`)
    if (isUselessColor(hex) || seen.has(hex)) continue
    seen.add(hex)

    const prefix = match[0].split('-[')[0]
    const role: ColorCandidate['role'] = prefix === 'bg' ? 'background' : prefix === 'text' ? 'text' : 'accent'
    const sat = colorSaturation(hex)

    if (sat > 0.1 || role === 'background') {
      candidates.push({ hex, role, source: `tailwind:${prefix}`, confidence: 0.70 })
    }
  }

  // data-color, data-bg, data-accent attributes
  const dataAttrRegex = /data-(?:color|bg|background|accent|brand)=["']([^"']+)["']/gi
  while ((match = dataAttrRegex.exec(html)) !== null) {
    const hex = parseCSSColor(match[1])
    if (!hex || isUselessColor(hex) || seen.has(hex)) continue
    seen.add(hex)
    candidates.push({ hex, role: 'accent', source: 'data-attr', confidence: 0.72 })
  }

  return candidates
}

/**
 * Source 1f: SVG fill/stroke HTML attributes (not CSS)
 * SVGs in header/nav/logo containers are strong brand signals.
 */
function extractFromSVGAttributes(html: string): ColorCandidate[] {
  const candidates: ColorCandidate[] = []
  const seen = new Set<string>()

  // Find all fill="..." and stroke="..." attributes in HTML
  const svgAttrRegex = /(?:fill|stroke)=["']([^"']+)["']/gi
  let match
  while ((match = svgAttrRegex.exec(html)) !== null) {
    const raw = match[1].trim()
    if (raw === 'none' || raw === 'currentColor' || raw === 'transparent' || raw.startsWith('url(')) continue
    const hex = parseCSSColor(raw)
    if (!hex || isUselessColor(hex) || isNearBlack(hex) || isNeutralGray(hex)) continue
    if (seen.has(hex)) continue
    seen.add(hex)

    const sat = colorSaturation(hex)
    if (sat < 0.1) continue

    // Check if SVG is inside a logo/header container
    const before = html.substring(Math.max(0, match.index - 500), match.index)
    const isInLogo = /(?:logo|brand|header|nav|masthead)/i.test(before)

    candidates.push({
      hex,
      role: 'accent',
      source: 'svg-attr',
      confidence: isInLogo ? 0.85 : 0.60,
      context: isInLogo ? 'SVG-Farbe im Logo/Header-Bereich' : 'SVG-Füllfarbe',
      element: 'svg',
      property: match[0].split('=')[0],
    })
  }

  return candidates
}

/**
 * Source 1g: Framework JSON data embedded in HTML
 * Extracts colors from __NEXT_DATA__, Wix, Squarespace, Shopify config
 */
function extractFromFrameworkJSON(html: string): ColorCandidate[] {
  const candidates: ColorCandidate[] = []
  const seen = new Set<string>()

  // ─── Next.js __NEXT_DATA__ ──────────────────────────────
  const nextDataMatch = html.match(/<script\s+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1])
      deepScanForColors(data, 'nextjs', candidates, seen, 8, 15)
    } catch { /* invalid JSON */ }
  }

  // ─── Nuxt __NUXT__ ─────────────────────────────────────
  const nuxtMatch = html.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i)
  if (nuxtMatch) {
    try {
      const data = JSON.parse(nuxtMatch[1])
      deepScanForColors(data, 'nuxt', candidates, seen, 8, 15)
    } catch { /* invalid JSON */ }
  }

  // ─── Wix warmup data ───────────────────────────────────
  const wixMatch = html.match(/<script\s+[^>]*id=["']wix-warmup-data["'][^>]*>([\s\S]*?)<\/script>/i)
  if (wixMatch) {
    try {
      const data = JSON.parse(wixMatch[1])
      deepScanForColors(data, 'wix', candidates, seen, 8, 20)
    } catch { /* invalid JSON */ }
  }

  // ─── Generic JSON in script tags ────────────────────────
  const scriptJsonRegex = /<script\s+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
  let scriptMatch
  let scriptCount = 0
  while ((scriptMatch = scriptJsonRegex.exec(html)) !== null && scriptCount < 5) {
    const body = scriptMatch[1].trim()
    if (body.length < 10 || body.length > 50000) continue
    // Skip already-processed framework data
    if (scriptMatch[0].includes('__NEXT_DATA__') || scriptMatch[0].includes('wix-warmup')) continue
    try {
      const data = JSON.parse(body)
      deepScanForColors(data, 'json-config', candidates, seen, 6, 5)
      scriptCount++
    } catch { /* invalid JSON */ }
  }

  // ─── JS variable assignments with color configs ─────────
  const configRegex = /(?:var|const|let)\s+\w*(?:config|theme|colors|settings|options)\w*\s*=\s*(\{[^;]{10,2000}\})/gi
  let configMatch
  while ((configMatch = configRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(configMatch[1])
      deepScanForColors(data, 'js-config', candidates, seen, 4, 5)
    } catch { /* likely not valid JSON */ }
  }

  return candidates
}

/**
 * Recursively scan a JSON object for hex color values.
 * Key names determine confidence and role.
 */
function deepScanForColors(
  obj: unknown,
  framework: string,
  candidates: ColorCandidate[],
  seen: Set<string>,
  maxDepth: number,
  maxResults: number,
  depth: number = 0,
  parentKey: string = '',
): void {
  if (depth > maxDepth || candidates.length >= maxResults) return

  if (typeof obj === 'string') {
    // Check if string looks like a hex color
    const hex = parseCSSColor(obj)
    if (!hex || isUselessColor(hex) || seen.has(hex)) return
    seen.add(hex)

    const keyLower = parentKey.toLowerCase()
    let confidence = 0.60
    let role: ColorCandidate['role'] = 'accent'
    let context = `Farbe aus ${framework} JSON-Konfiguration`

    if (/primary|brand|main|haupt/.test(keyLower)) {
      confidence = 0.88
      role = 'background'
      context = `${framework}: Hauptfarbe (${parentKey})`
    } else if (/accent|secondary|sekundär|highlight/.test(keyLower)) {
      confidence = 0.85
      context = `${framework}: Akzentfarbe (${parentKey})`
    } else if (/background|bg|hintergrund/.test(keyLower)) {
      confidence = 0.83
      role = 'background'
      context = `${framework}: Hintergrundfarbe (${parentKey})`
    } else if (/button|btn|cta/.test(keyLower)) {
      confidence = 0.80
      context = `${framework}: Button-Farbe (${parentKey})`
    } else if (/header|nav|menu/.test(keyLower)) {
      confidence = 0.82
      role = 'background'
      context = `${framework}: Header/Navigation-Farbe (${parentKey})`
    } else if (/color|colour|farbe/.test(keyLower)) {
      confidence = 0.70
      context = `${framework}: Farbe (${parentKey})`
    } else {
      // Not a color-related key — skip
      return
    }

    candidates.push({ hex, role, source: `${framework}:${parentKey}`, confidence, context, property: parentKey })
    return
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < Math.min(obj.length, 20); i++) {
      deepScanForColors(obj[i], framework, candidates, seen, maxDepth, maxResults, depth + 1, parentKey)
    }
    return
  }

  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      deepScanForColors(value, framework, candidates, seen, maxDepth, maxResults, depth + 1, key)
    }
  }
}

/**
 * Source 1h: manifest.json theme_color and background_color
 */
async function extractFromManifest(html: string, baseUrl: string): Promise<ColorCandidate[]> {
  const candidates: ColorCandidate[] = []

  // Find manifest URL
  const manifestMatch = html.match(/<link[^>]*rel=["']manifest["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']manifest["']/i)
  if (!manifestMatch) return candidates

  try {
    const manifestUrl = new URL(manifestMatch[1], baseUrl).href
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    const res = await fetch(manifestUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    clearTimeout(timeout)

    if (!res.ok) return candidates
    const manifest = await res.json()

    if (manifest.theme_color) {
      const hex = parseCSSColor(manifest.theme_color)
      if (hex && !isUselessColor(hex)) {
        candidates.push({
          hex, role: 'background', source: 'manifest:theme_color', confidence: 0.92,
          context: 'PWA Theme-Farbe aus manifest.json', property: 'theme_color',
        })
      }
    }

    if (manifest.background_color) {
      const hex = parseCSSColor(manifest.background_color)
      if (hex && !isUselessColor(hex)) {
        candidates.push({
          hex, role: 'background', source: 'manifest:background_color', confidence: 0.80,
          context: 'PWA Hintergrundfarbe aus manifest.json', property: 'background_color',
        })
      }
    }
  } catch { /* manifest fetch failed */ }

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
        console.log(`[CSS Colors] Fetching ${Math.min(sheetUrls.length, 10)} of ${sheetUrls.length} external stylesheets`)
        externalCSS = await fetchExternalCSS(sheetUrls)
        console.log(`[CSS Colors] External CSS: ${(externalCSS.length / 1024).toFixed(0)}KB`)
      }
    } catch {
      // External CSS fetch failed, continue with inline only
    }
  }

  const css = inlineCSS + '\n' + externalCSS

  // Fetch manifest colors in parallel with CSS processing
  const manifestPromise = baseUrl ? extractFromManifest(html, baseUrl) : Promise.resolve([])

  const allCandidates: ColorCandidate[] = [
    ...extractFromCSSVars(css),
    ...extractFromMetaTags(html),
    ...extractFromInlineStyles(html),
    ...extractFromStyleRules(css),
    ...extractFromHTMLClasses(html),
    ...extractFromSVGAttributes(html),
    ...extractFromFrameworkJSON(html),
    ...(await manifestPromise),
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
