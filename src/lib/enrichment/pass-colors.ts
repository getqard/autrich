/**
 * Unified Pass Color Determination — CSS-First Architecture
 *
 * Flow:
 * 1. Text-AI picks from CSS candidates (cheapest, no hallucination)
 * 2. CSS Waterfall fallback (algorithmic, $0)
 * 3. Screenshot + Vision AI (optional premium, only if CSS fails completely)
 *
 * Three colors, all brand-related:
 * - backgroundColor: dark brand color (logo visible on top)
 * - labelColor: brand accent (WCAG AA ≥ 3:1 on BG)
 * - textColor: white or black (WCAG AA ≥ 4.5:1 on BG)
 */

import type { ColorCandidate } from './types'
import type { PaletteResult } from './colors'
import { pickColorsFromCSS } from './ai-color-picker'
import { pickBrandColors } from './color-picker'
import {
  extractLogoContentColor,
  extractPalette,
  perceptualDistance,
  hexLuminance,
  colorSaturation,
  isBoringColor,
  darkenHSL,
  lightenHSL,
  ensurePassSuitable,
  wcagContrastRatio,
  hexToHsl,
  hslToHex,
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  mixColors,
} from './colors'

// ─── Types ──────────────────────────────────────────────────

export type PassColorInput = {
  logoBuffer: Buffer | null
  cssCandidates: ColorCandidate[]
  headerBackground: string | null
  headerScreenshot?: Buffer | null
  websiteContext: {
    title: string | null
    description: string | null
    themeColor: string | null
  }
  industrySlug: string | null
  industryDefaults: { default_color?: string; default_accent?: string } | null
  gmapsPhotoBuffer: Buffer | null
  /** If true, uses screenshot + Vision AI as last resort when CSS fails */
  allowScreenshotFallback?: boolean
}

export type PassColorOutput = {
  backgroundColor: string
  accentColor: string | null
  textColor: string
  labelColor: string
  method: string
  logoContentColor: { hex: string; luminance: number; saturation: number } | null
  palette: PaletteResult | null
  logoContrast: 'good' | 'low' | 'unknown'
}

// ─── Rasterize SVGs ─────────────────────────────────────────

async function ensureRasterBuffer(buf: Buffer): Promise<Buffer> {
  const { default: sharpMod } = await import('sharp')
  const head = buf.subarray(0, 256).toString('utf8').trim()
  const isSvg = head.startsWith('<svg') || head.startsWith('<?xml') || head.includes('<svg')
  if (isSvg) {
    return sharpMod(buf)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer()
  }
  try {
    const meta = await sharpMod(buf).metadata()
    if (meta.format === 'svg') {
      return sharpMod(buf)
        .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer()
    }
  } catch { /* not recognizable, return as-is */ }
  return buf
}

// ─── Helpers ────────────────────────────────────────────────

function checkLogoContrast(bg: string, logoColor: { hex: string } | null): 'good' | 'low' | 'unknown' {
  if (!logoColor) return 'unknown'
  const dist = perceptualDistance(bg, logoColor.hex)
  return dist > 100 ? 'good' : 'low'
}

function ensureLabelContrast(label: string, bg: string): string {
  let ratio = wcagContrastRatio(label, bg)
  if (ratio >= 3.0) return label

  const bgLum = hexLuminance(bg)
  const hsl = hexToHsl(label)
  const direction = bgLum < 0.5 ? 1 : -1

  for (let step = 0; step < 20; step++) {
    hsl.l = Math.max(0, Math.min(1, hsl.l + direction * 0.03))
    const candidate = hslToHex(hsl.h, hsl.s, hsl.l)
    ratio = wcagContrastRatio(candidate, bg)
    if (ratio >= 3.0) return candidate
  }

  return bgLum < 0.5 ? lightenHSL(label, 0.7) : darkenHSL(label, 0.3)
}

function deriveTextColor(bg: string): string {
  const bgRgb = hexToRgb(bg)
  const bgLum = relativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b)
  const whiteContrast = contrastRatio(1.0, bgLum)
  const blackContrast = contrastRatio(bgLum, 0.0)
  return whiteContrast >= blackContrast ? '#ffffff' : '#000000'
}

// ─── Main Function ──────────────────────────────────────────

export async function determinePassColors(input: PassColorInput): Promise<PassColorOutput> {
  const {
    logoBuffer,
    headerScreenshot,
    websiteContext,
    industrySlug,
    industryDefaults,
    gmapsPhotoBuffer,
  } = input

  const log = (msg: string) => console.log(`[PassColors] ${msg}`)

  // ─── Sanitize inputs ──────────────────────────────────────
  const isValid6Hex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s)
  const cssCandidates = input.cssCandidates.filter(c => isValid6Hex(c.hex))
  const headerBackground = input.headerBackground && isValid6Hex(input.headerBackground)
    ? input.headerBackground
    : null

  if (cssCandidates.length !== input.cssCandidates.length) {
    log(`Filtered ${input.cssCandidates.length - cssCandidates.length} invalid hex candidates`)
  }

  log(`Input: ${cssCandidates.length} CSS candidates, headerBG=${headerBackground}, logo=${logoBuffer ? `${logoBuffer.length}B` : 'null'}, screenshot=${headerScreenshot ? `${headerScreenshot.length}B` : 'null'}, industry=${industrySlug}`)

  // Rasterize logo if needed
  let rasterLogo: Buffer | null = null
  if (logoBuffer) {
    try {
      rasterLogo = await ensureRasterBuffer(logoBuffer)
    } catch {
      rasterLogo = logoBuffer
    }
  }

  // ─── Pre-extraction (needed for fallback + logo contrast check) ──
  let logoColor: Awaited<ReturnType<typeof extractLogoContentColor>> = null
  let palette: PaletteResult | null = null

  if (rasterLogo) {
    try {
      logoColor = await extractLogoContentColor(rasterLogo)
      log(`Logo content color: ${logoColor ? `${logoColor.hex} (lum=${logoColor.luminance.toFixed(2)}, sat=${logoColor.saturation.toFixed(2)})` : 'null'}`)
    } catch (err) {
      log(`Logo content color FAILED: ${err instanceof Error ? err.message : err}`)
    }
    try {
      palette = await extractPalette(rasterLogo)
      log(`Palette: dominant=${palette.dominant}, accent=${palette.accent}`)
    } catch (err) {
      log(`Palette FAILED: ${err instanceof Error ? err.message : err}`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Text-AI picks from CSS candidates (cheapest path)
  // ═══════════════════════════════════════════════════════════

  try {
    const textAI = await pickColorsFromCSS(
      cssCandidates,
      logoColor,
      websiteContext.title,
      industrySlug,
    )

    if (textAI) {
      const bg = textAI.backgroundColor
      const textColor = deriveTextColor(bg)

      let labelColor: string
      if (textAI.labelColor) {
        labelColor = ensureLabelContrast(textAI.labelColor, bg)
      } else {
        labelColor = deriveLabelFromCSS(cssCandidates, bg, websiteContext)
      }

      if (labelColor === textColor) {
        const hsl = hexToHsl(labelColor)
        const bgHsl = hexToHsl(bg)
        labelColor = hslToHex(bgHsl.h, Math.max(0.15, bgHsl.s), hsl.l)
        labelColor = ensureLabelContrast(labelColor, bg)
      }

      const logoContrast = checkLogoContrast(bg, logoColor)

      log(`Text-AI: bg=${bg} label=${labelColor} text=${textColor} method=text-ai (confidence=${textAI.confidence}, $${textAI.costUsd.toFixed(5)}, reason="${textAI.reasoning}")`)

      return {
        backgroundColor: bg,
        accentColor: textAI.labelColor,
        textColor,
        labelColor,
        method: 'text-ai',
        logoContentColor: logoColor,
        palette,
        logoContrast,
      }
    } else {
      log('Text-AI returned null → falling back to CSS waterfall')
    }
  } catch (err) {
    log(`Text-AI ERROR: ${err instanceof Error ? err.message : err} → falling back`)
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 2: CSS-Based Waterfall (no AI, $0)
  // ═══════════════════════════════════════════════════════════

  const cssResult = await cssFallback({
    rasterLogo,
    cssCandidates,
    headerBackground,
    websiteContext,
    industryDefaults,
    gmapsPhotoBuffer,
    logoColor,
    palette,
    log,
  })

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Screenshot Vision-AI (optional premium fallback)
  // Only if CSS result is weak AND screenshot is available
  // ═══════════════════════════════════════════════════════════

  const cssWeak = cssResult.method === 'fallback' || cssResult.method === 'industry-default'
  const screenshotOk = headerScreenshot && headerScreenshot.length > 50000

  if (cssWeak && screenshotOk && input.allowScreenshotFallback && rasterLogo) {
    try {
      const aiColors = await pickBrandColors(rasterLogo, headerScreenshot)
      if (aiColors) {
        const bg = aiColors.background
        const textColor = deriveTextColor(bg)
        let labelColor = aiColors.label
          ? ensureLabelContrast(aiColors.label, bg)
          : deriveLabelFromCSS(cssCandidates, bg, websiteContext)

        if (labelColor === textColor) {
          const hsl = hexToHsl(labelColor)
          const bgHsl = hexToHsl(bg)
          labelColor = hslToHex(bgHsl.h, Math.max(0.15, bgHsl.s), hsl.l)
          labelColor = ensureLabelContrast(labelColor, bg)
        }

        const logoContrast = checkLogoContrast(bg, logoColor)
        log(`Vision-AI fallback: bg=${bg} label=${labelColor} method=vision-ai-fallback`)

        return {
          backgroundColor: bg,
          accentColor: aiColors.label,
          textColor,
          labelColor,
          method: 'vision-ai-fallback',
          logoContentColor: logoColor,
          palette,
          logoContrast,
        }
      }
    } catch (err) {
      log(`Vision-AI fallback failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  return cssResult
}

// ─── Derive label from CSS candidates ────────────────────────

function deriveLabelFromCSS(
  cssCandidates: ColorCandidate[],
  bg: string,
  websiteContext: { themeColor: string | null },
): string {
  // Find the most saturated CSS color that has good contrast on bg
  const candidates = cssCandidates
    .filter(c => {
      const sat = colorSaturation(c.hex)
      const wcag = wcagContrastRatio(c.hex, bg)
      return sat >= 0.15 && wcag >= 2.0 && perceptualDistance(c.hex, bg) > 50
    })
    .sort((a, b) => colorSaturation(b.hex) - colorSaturation(a.hex))

  if (candidates.length > 0) {
    return ensureLabelContrast(candidates[0].hex, bg)
  }

  // Theme color fallback
  if (websiteContext.themeColor && colorSaturation(websiteContext.themeColor) >= 0.15) {
    return ensureLabelContrast(websiteContext.themeColor, bg)
  }

  // Derive from bg hue
  const bgHsl = hexToHsl(bg)
  const targetL = bgHsl.l < 0.5 ? 0.65 : 0.35
  const derived = hslToHex(bgHsl.h, Math.max(bgHsl.s, 0.25), targetL)
  return ensureLabelContrast(derived, bg)
}

// ─── CSS-Based Fallback (replaces old waterfall) ─────────────

async function cssFallback(ctx: {
  rasterLogo: Buffer | null
  cssCandidates: ColorCandidate[]
  headerBackground: string | null
  websiteContext: { title: string | null; description: string | null; themeColor: string | null }
  industryDefaults: { default_color?: string; default_accent?: string } | null
  gmapsPhotoBuffer: Buffer | null
  logoColor: Awaited<ReturnType<typeof extractLogoContentColor>>
  palette: PaletteResult | null
  log: (msg: string) => void
}): Promise<PassColorOutput> {
  const { rasterLogo, cssCandidates, headerBackground, websiteContext, industryDefaults, gmapsPhotoBuffer, logoColor, palette, log } = ctx

  log('CSS-based color selection (no AI)')

  let bg: string | null = null
  let accent: string | null = null
  let method = 'fallback'

  // ─── STEP 1: Header Background ────────────────────────────
  if (headerBackground) {
    const logoVisible = !logoColor || perceptualDistance(headerBackground, logoColor.hex) > 130
    if (logoVisible) {
      const lum = hexLuminance(headerBackground)
      bg = lum <= 0.45 ? ensurePassSuitable(headerBackground) : darkenHSL(headerBackground, 0.2)
      method = 'header-bg'
      log(`STEP 1 ✓ Header BG: ${headerBackground} → ${bg}`)
    } else {
      log(`STEP 1 ✗ Header BG too close to logo`)
    }
  }

  // ─── STEP 2: High-confidence CSS brand variable ────────────
  if (!bg) {
    const brandVar = cssCandidates
      .filter(c => c.confidence >= 0.9 && c.role === 'background' && hexLuminance(c.hex) <= 0.5)
      .sort((a, b) => b.confidence - a.confidence)[0]
    if (brandVar) {
      bg = ensurePassSuitable(brandVar.hex)
      method = 'css-brand-var'
      log(`STEP 2 ✓ CSS Brand: ${brandVar.hex} → ${bg}`)
    }
  }

  // ─── STEP 3: Best CSS background with logo contrast ────────
  // Only trust CSS if we have enough data (≥3 candidates or ≥1 high-confidence)
  const hasReliableCSS = cssCandidates.length >= 3 || cssCandidates.some(c => c.confidence >= 0.75)
  if (!bg && hasReliableCSS) {
    // Sort by: dark colors first, then by confidence
    const bgOptions = cssCandidates
      .filter(c => {
        const lum = hexLuminance(c.hex)
        return lum <= 0.45 && lum >= 0.02
      })
      .sort((a, b) => {
        const confDiff = b.confidence - a.confidence
        if (Math.abs(confDiff) > 0.1) return confDiff
        return hexLuminance(a.hex) - hexLuminance(b.hex)
      })

    // Pick the one with best logo contrast
    for (const option of bgOptions) {
      if (!logoColor || perceptualDistance(option.hex, logoColor.hex) > 100) {
        bg = ensurePassSuitable(option.hex)
        method = 'css-best'
        log(`STEP 3 ✓ CSS Best: ${option.hex} (conf=${option.confidence.toFixed(2)}) → ${bg}`)
        break
      }
    }

    if (!bg && bgOptions.length > 0) {
      // No good logo contrast, take the best CSS color anyway
      bg = ensurePassSuitable(bgOptions[0].hex)
      method = 'css-best'
      log(`STEP 3 ✓ CSS Best (no logo check): ${bgOptions[0].hex} → ${bg}`)
    }
  }

  // ─── STEP 4: Theme color ────────────────────────────────────
  if (!bg && websiteContext.themeColor && isValid6Hex(websiteContext.themeColor)) {
    bg = ensurePassSuitable(websiteContext.themeColor)
    method = 'theme-color'
    log(`STEP 4 ✓ Theme color: ${websiteContext.themeColor} → ${bg}`)
  }

  // ─── STEP 5: Logo-derived ──────────────────────────────────
  if (!bg && logoColor && logoColor.saturation >= 0.1) {
    bg = darkenHSL(logoColor.hex, 0.15)
    method = 'logo-derived'
    log(`STEP 5 ✓ Logo derived: ${logoColor.hex} → ${bg}`)
  }

  // ─── STEP 6: Vibrant Palette ──────────────────────────────
  if (!bg && palette && !isBoringColor(palette.dominant)) {
    bg = ensurePassSuitable(palette.dominant)
    accent = palette.accent
    method = 'vibrant-palette'
    log(`STEP 6 ✓ Vibrant: ${palette.dominant} → ${bg}`)
  }

  // ─── STEP 7: GMaps Photo ──────────────────────────────────
  if (!bg && gmapsPhotoBuffer) {
    try {
      const photoPalette = await extractPalette(gmapsPhotoBuffer)
      if (!isBoringColor(photoPalette.dominant)) {
        bg = ensurePassSuitable(photoPalette.dominant)
        accent = photoPalette.accent
        method = 'gmaps-photo'
        log(`STEP 7 ✓ GMaps: ${photoPalette.dominant} → ${bg}`)
      }
    } catch { /* skip */ }
  }

  // ─── STEP 8: Industry Default ─────────────────────────────
  if (!bg && industryDefaults?.default_color) {
    bg = industryDefaults.default_color
    accent = industryDefaults.default_accent ?? null
    method = 'industry-default'
    log(`STEP 8 ✓ Industry: ${bg}`)
  }

  // ─── STEP 9: Ultimate fallback ────────────────────────────
  if (!bg) {
    bg = '#1a1a2e'
    method = 'fallback'
    log('STEP 9 → Fallback #1a1a2e')
  }

  // ═══ TEXT COLOR ══════════════════════════════════════════════
  const textColor = deriveTextColor(bg)

  // ═══ LABEL COLOR ════════════════════════════════════════════
  let labelColor = deriveLabelFromCSS(cssCandidates, bg, websiteContext)

  // If accent was found during bg selection, prefer it
  if (accent && colorSaturation(accent) >= 0.15) {
    const contrastOk = wcagContrastRatio(accent, bg) >= 2.5
    if (contrastOk) {
      labelColor = ensureLabelContrast(accent, bg)
    }
  }

  // Saturation guard
  if (colorSaturation(labelColor) < 0.1) {
    const bgHsl = hexToHsl(bg)
    const targetL = bgHsl.l < 0.5 ? 0.65 : 0.35
    labelColor = hslToHex(bgHsl.h, Math.max(bgHsl.s, 0.25), targetL)
    labelColor = ensureLabelContrast(labelColor, bg)
    log(`Label saturation guard → ${labelColor}`)
  }

  // Ensure label ≠ text
  if (labelColor === textColor) {
    const bgHsl = hexToHsl(bg)
    const hsl = hexToHsl(labelColor)
    labelColor = hslToHex(bgHsl.h, Math.max(0.15, bgHsl.s), hsl.l)
    labelColor = ensureLabelContrast(labelColor, bg)
  }

  log(`RESULT: bg=${bg} text=${textColor} label=${labelColor} method=${method}`)

  // ═══ LOGO CONTRAST CHECK ═══════════════════════════════════
  let logoContrast = checkLogoContrast(bg, logoColor)

  if (logoContrast === 'low' && logoColor) {
    const bgLumVal = hexLuminance(bg)
    const logoLum = logoColor.luminance
    if (Math.abs(bgLumVal - logoLum) < 0.3) {
      if (logoLum > 0.5) {
        bg = darkenHSL(bg, 0.1)
      } else {
        bg = darkenHSL(bg, Math.max(0.05, bgLumVal - 0.15))
      }
      const newTextColor = deriveTextColor(bg)
      labelColor = ensureLabelContrast(labelColor, bg)
      logoContrast = checkLogoContrast(bg, logoColor)

      return {
        backgroundColor: bg,
        accentColor: accent,
        textColor: newTextColor,
        labelColor,
        method: method + '+adjusted',
        logoContentColor: logoColor,
        palette,
        logoContrast,
      }
    }
  }

  return {
    backgroundColor: bg,
    accentColor: accent,
    textColor,
    labelColor,
    method,
    logoContentColor: logoColor,
    palette,
    logoContrast,
  }
}

function isValid6Hex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s)
}
