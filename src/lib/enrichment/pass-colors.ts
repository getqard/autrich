/**
 * Unified Pass Color Determination — Brand-aware, contrast-safe.
 *
 * Three colors, all brand-related:
 * - backgroundColor: dark brand color (logo visible on top)
 * - labelColor: brand accent (WCAG AA ≥ 3:1 on BG)
 * - textColor: white or black (WCAG AA ≥ 4.5:1 on BG)
 */

import type { ColorCandidate } from './types'
import type { PaletteResult } from './colors'
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
  websiteContext: {
    title: string | null
    description: string | null
    themeColor: string | null
  }
  industrySlug: string | null
  industryDefaults: { default_color?: string; default_accent?: string } | null
  gmapsPhotoBuffer: Buffer | null
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

/**
 * Ensure label has WCAG ≥ 3:1 contrast on background.
 * Adjusts lightness until it passes.
 */
function ensureLabelContrast(label: string, bg: string): string {
  let ratio = wcagContrastRatio(label, bg)
  if (ratio >= 3.0) return label

  const bgLum = hexLuminance(bg)
  const hsl = hexToHsl(label)
  // If bg is dark, lighten the label; if bg is light, darken it
  const direction = bgLum < 0.5 ? 1 : -1

  for (let step = 0; step < 20; step++) {
    hsl.l = Math.max(0, Math.min(1, hsl.l + direction * 0.03))
    const candidate = hslToHex(hsl.h, hsl.s, hsl.l)
    ratio = wcagContrastRatio(candidate, bg)
    if (ratio >= 3.0) return candidate
  }

  // Last resort: return white or black with some color
  return bgLum < 0.5 ? lightenHSL(label, 0.7) : darkenHSL(label, 0.3)
}

// ─── Main Function ──────────────────────────────────────────

export async function determinePassColors(input: PassColorInput): Promise<PassColorOutput> {
  const {
    logoBuffer,
    cssCandidates,
    headerBackground,
    websiteContext,
    industrySlug,
    industryDefaults,
    gmapsPhotoBuffer,
  } = input

  // Rasterize logo if needed
  let rasterLogo: Buffer | null = null
  if (logoBuffer) {
    try {
      rasterLogo = await ensureRasterBuffer(logoBuffer)
    } catch {
      rasterLogo = logoBuffer
    }
  }

  // ─── Pre-extraction (once!) ───────────────────────────────
  let logoColor: Awaited<ReturnType<typeof extractLogoContentColor>> = null
  let palette: PaletteResult | null = null

  if (rasterLogo) {
    try { logoColor = await extractLogoContentColor(rasterLogo) } catch { /* non-fatal */ }
    try { palette = await extractPalette(rasterLogo) } catch { /* non-fatal */ }
  }

  let bg: string | null = null
  let accent: string | null = null
  let method = 'fallback'

  // ─── STEP 1: AI Color Picker ──────────────────────────────
  if (rasterLogo) {
    try {
      const aiColors = await pickBrandColors(
        rasterLogo,
        {
          ...websiteContext,
          headerBackground,
          logoContentColor: logoColor?.hex ?? null,
        },
        cssCandidates,
      )
      if (aiColors && aiColors.confidence >= 0.7) {
        bg = aiColors.background
        accent = aiColors.accent
        method = 'ai-picker'
      }
    } catch { /* non-fatal */ }
  }

  // ─── STEP 2: Header Background ────────────────────────────
  if (!bg && headerBackground) {
    // Only use if logo is visible on this background
    const logoVisible = !logoColor || perceptualDistance(headerBackground, logoColor.hex) > 130
    if (logoVisible) {
      const lum = hexLuminance(headerBackground)
      bg = lum <= 0.45 ? ensurePassSuitable(headerBackground) : darkenHSL(headerBackground, 0.2)
      method = 'header-bg'
    }
  }

  // ─── STEP 3: Brand Palette Contrast Selection ─────────────
  if (!bg && cssCandidates.length > 0 && logoColor) {
    const bgCandidates: Array<ColorCandidate & { dist: number }> = []
    const labelCandidates: Array<ColorCandidate & { dist: number }> = []

    for (const c of cssCandidates) {
      const dist = perceptualDistance(c.hex, logoColor.hex)
      if (dist > 130) bgCandidates.push({ ...c, dist })
      else if (dist < 100) labelCandidates.push({ ...c, dist })
    }

    if (bgCandidates.length > 0) {
      // Pick the darkest contrasting candidate
      bgCandidates.sort((a, b) => hexLuminance(a.hex) - hexLuminance(b.hex))
      bg = ensurePassSuitable(bgCandidates[0].hex)
      // Use a logo-similar color as accent if available
      accent = labelCandidates[0]?.hex ?? null
      method = 'css-contrast'
    }
  }

  // ─── STEP 4: CSS Direct (no logo color available) ─────────
  if (!bg && cssCandidates.length > 0) {
    const bestCSS = cssCandidates
      .filter(c => c.role === 'background' && c.confidence >= 0.6 && hexLuminance(c.hex) <= 0.9)
      .sort((a, b) => b.confidence - a.confidence)[0]
    if (bestCSS) {
      bg = ensurePassSuitable(bestCSS.hex)
      method = 'css-direct'
    }
  }

  // ─── STEP 5: Logo Color Darkened ──────────────────────────
  if (!bg && logoColor && logoColor.saturation >= 0.1) {
    bg = darkenHSL(logoColor.hex, 0.15)
    method = 'logo-darkened'
  }

  // ─── STEP 6: Vibrant Palette ──────────────────────────────
  if (!bg && palette) {
    if (!isBoringColor(palette.dominant)) {
      bg = ensurePassSuitable(palette.dominant)
      accent = palette.accent
      method = 'vibrant-palette'
    } else {
      // Try most saturated swatch
      const bestSwatch = palette.swatches
        .filter(s => s.saturation >= 0.15)
        .sort((a, b) => b.saturation - a.saturation)[0]
      if (bestSwatch) {
        bg = ensurePassSuitable(bestSwatch.hex)
        method = 'vibrant-swatch'
      }
    }
  }

  // ─── STEP 7: GMaps Photo ──────────────────────────────────
  if (!bg && gmapsPhotoBuffer) {
    try {
      const photoPalette = await extractPalette(gmapsPhotoBuffer)
      if (!isBoringColor(photoPalette.dominant)) {
        bg = ensurePassSuitable(photoPalette.dominant)
        accent = photoPalette.accent
        method = 'gmaps-photo'
      }
    } catch { /* non-fatal */ }
  }

  // ─── STEP 8: Industry Default ─────────────────────────────
  if (!bg && industryDefaults?.default_color) {
    bg = industryDefaults.default_color
    accent = industryDefaults.default_accent ?? null
    method = 'industry-default'
  }

  // ─── STEP 9: Fallback ────────────────────────────────────
  if (!bg) {
    bg = '#1a1a2e'
    method = 'fallback'
  }

  // ═══ FOREGROUND (text) ═════════════════════════════════════
  const bgRgb = hexToRgb(bg)
  const bgLum = relativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b)
  const whiteContrast = contrastRatio(1.0, bgLum)
  const blackContrast = contrastRatio(bgLum, 0.0)
  const textColor = whiteContrast >= blackContrast ? '#ffffff' : '#000000'

  // ═══ LABEL COLOR (brand-aware) ═════════════════════════════

  let labelColor: string | null = null

  // Strategy A: Brand accent from CSS (if WCAG ≥ 3:1 on BG)
  if (!labelColor && accent) {
    if (wcagContrastRatio(accent, bg) >= 3.0) {
      labelColor = accent
    }
  }

  // Also check CSS accent candidates directly
  if (!labelColor) {
    const accentCandidates = cssCandidates.filter(c =>
      c.role === 'accent' && c.hex !== bg
    )
    for (const c of accentCandidates) {
      if (wcagContrastRatio(c.hex, bg) >= 3.0) {
        labelColor = c.hex
        break
      }
    }
  }

  // Strategy B: Logo color as label (if ≠ BG + WCAG ≥ 3:1)
  if (!labelColor && logoColor) {
    const dist = perceptualDistance(logoColor.hex, bg)
    if (dist > 80 && wcagContrastRatio(logoColor.hex, bg) >= 3.0) {
      labelColor = logoColor.hex
    }
  }

  // Strategy C: HSL derivation from background
  if (!labelColor) {
    const bgHsl = hexToHsl(bg)
    // Same hue, keep saturation, increase lightness
    const targetL = bgHsl.l < 0.5 ? 0.6 : 0.35
    const derived = hslToHex(bgHsl.h, Math.max(bgHsl.s, 0.15), targetL)
    if (wcagContrastRatio(derived, bg) >= 3.0) {
      labelColor = derived
    }
  }

  // Strategy D: Fallback mix
  if (!labelColor) {
    labelColor = mixColors(bg, textColor, 0.35)
  }

  // Ensure label passes WCAG
  labelColor = ensureLabelContrast(labelColor, bg)

  // Ensure label ≠ foreground
  if (labelColor === textColor) {
    const hsl = hexToHsl(labelColor)
    // Shift slightly toward background hue
    const bgHsl = hexToHsl(bg)
    labelColor = hslToHex(bgHsl.h, Math.max(0.15, bgHsl.s), hsl.l)
    labelColor = ensureLabelContrast(labelColor, bg)
  }

  // ═══ FINAL VALIDATION ══════════════════════════════════════

  let logoContrast = checkLogoContrast(bg, logoColor)

  // If logo contrast is low, adjust BG
  if (logoContrast === 'low' && logoColor) {
    const bgLumVal = hexLuminance(bg)
    const logoLum = logoColor.luminance
    // Move BG away from logo luminance
    if (Math.abs(bgLumVal - logoLum) < 0.3) {
      if (logoLum > 0.5) {
        // Logo is light → make BG darker
        bg = darkenHSL(bg, 0.1)
      } else {
        // Logo is dark → make BG lighter (but still dark enough for pass)
        bg = darkenHSL(bg, Math.max(0.05, bgLumVal - 0.15))
      }
      // Re-derive text and label
      const newBgRgb = hexToRgb(bg)
      const newBgLum = relativeLuminance(newBgRgb.r, newBgRgb.g, newBgRgb.b)
      const newWhiteContrast = contrastRatio(1.0, newBgLum)
      const newBlackContrast = contrastRatio(newBgLum, 0.0)
      const newTextColor = newWhiteContrast >= newBlackContrast ? '#ffffff' : '#000000'
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
