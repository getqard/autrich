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

  const log = (msg: string) => console.log(`[PassColors] ${msg}`)

  log(`Input: ${cssCandidates.length} CSS candidates, headerBG=${headerBackground}, logo=${logoBuffer ? `${logoBuffer.length}B` : 'null'}, industry=${industrySlug}`)

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
    try {
      logoColor = await extractLogoContentColor(rasterLogo)
      log(`Logo content color: ${logoColor ? `${logoColor.hex} (lum=${logoColor.luminance.toFixed(2)}, sat=${logoColor.saturation.toFixed(2)})` : 'null (too few pixels)'}`)
    } catch (err) {
      log(`Logo content color FAILED: ${err instanceof Error ? err.message : err}`)
    }
    try {
      palette = await extractPalette(rasterLogo)
      log(`Palette: dominant=${palette.dominant} (boring=${isBoringColor(palette.dominant)}), accent=${palette.accent}, swatches=${palette.swatches.length}`)
    } catch (err) {
      log(`Palette FAILED: ${err instanceof Error ? err.message : err}`)
    }
  } else {
    log('No logo buffer available — skipping color extraction')
  }

  let bg: string | null = null
  let accent: string | null = null
  let method = 'fallback'

  // ─── STEP 1: AI Color Picker ──────────────────────────────
  let aiAccentOnly: string | null = null // accent from AI even if BG was rejected

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
        log(`STEP 1 ✓ AI Picker: bg=${bg}, accent=${accent}, conf=${aiColors.confidence}`)
      } else if (aiColors && aiColors.confidence === 0 && aiColors.accent) {
        // BG was rejected by post-validation, but accent survived
        aiAccentOnly = aiColors.accent
        log(`STEP 1 ~ AI Picker: BG rejected, keeping accent=${aiAccentOnly}`)
      } else {
        log(`STEP 1 ✗ AI Picker: ${aiColors ? `conf=${aiColors.confidence} (< 0.7)` : 'returned null (no API key or failed)'}`)
      }
    } catch (err) {
      log(`STEP 1 ✗ AI Picker ERROR: ${err instanceof Error ? err.message : err}`)
    }
  } else {
    log('STEP 1 ✗ AI Picker: no logo')
  }

  // ─── STEP 2: Header Background ────────────────────────────
  if (!bg && headerBackground) {
    const logoVisible = !logoColor || perceptualDistance(headerBackground, logoColor.hex) > 130
    const dist = logoColor ? perceptualDistance(headerBackground, logoColor.hex) : -1
    if (logoVisible) {
      const lum = hexLuminance(headerBackground)
      bg = lum <= 0.45 ? ensurePassSuitable(headerBackground) : darkenHSL(headerBackground, 0.2)
      method = 'header-bg'
      log(`STEP 2 ✓ Header BG: ${headerBackground} → ${bg} (logoDist=${dist.toFixed(0)})`)
    } else {
      log(`STEP 2 ✗ Header BG: ${headerBackground} too close to logo (dist=${dist.toFixed(0)} < 130)`)
    }
  } else if (!bg) {
    log(`STEP 2 ✗ Header BG: ${headerBackground ? 'skipped (already have bg)' : 'not found'}`)
  }

  // ─── STEP 2b: High-confidence CSS brand variable ──────────
  // Elementor-primary, Astra-primary etc. with conf >= 0.9 are set by
  // the brand designer — strongest algorithmic signal after header BG.
  if (!bg) {
    const brandVar = cssCandidates
      .filter(c => c.confidence >= 0.9 && c.role === 'background' && hexLuminance(c.hex) <= 0.5)
      .sort((a, b) => b.confidence - a.confidence)[0]
    if (brandVar) {
      bg = ensurePassSuitable(brandVar.hex)
      method = 'css-brand-var'
      log(`STEP 2b ✓ CSS Brand Variable: ${brandVar.hex} (${brandVar.source}, conf=${brandVar.confidence.toFixed(2)}) → ${bg}`)
    } else {
      log(`STEP 2b ✗ No high-confidence dark CSS brand variable`)
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

    log(`STEP 3: ${bgCandidates.length} BG candidates (dist>130), ${labelCandidates.length} label candidates (dist<100)`)

    if (bgCandidates.length > 0) {
      // Sort by confidence first, then darkest as tiebreaker
      bgCandidates.sort((a, b) => {
        const confDiff = b.confidence - a.confidence
        if (Math.abs(confDiff) > 0.1) return confDiff
        return hexLuminance(a.hex) - hexLuminance(b.hex)
      })
      bg = ensurePassSuitable(bgCandidates[0].hex)
      accent = labelCandidates[0]?.hex ?? null
      method = 'css-contrast'
      log(`STEP 3 ✓ CSS Contrast: ${bgCandidates[0].hex} (conf=${bgCandidates[0].confidence.toFixed(2)}) → ${bg}, accent=${accent}`)
    } else {
      log(`STEP 3 ✗ No CSS candidates with enough distance to logo`)
    }
  } else if (!bg) {
    log(`STEP 3 ✗ CSS Contrast: ${cssCandidates.length === 0 ? 'no CSS candidates' : 'no logo color'}`)
  }

  // ─── STEP 4: CSS Direct (no logo color available) ─────────
  if (!bg && cssCandidates.length > 0) {
    const eligible = cssCandidates.filter(c => c.role === 'background' && c.confidence >= 0.5 && hexLuminance(c.hex) <= 0.9)
    const bestCSS = eligible.sort((a, b) => b.confidence - a.confidence)[0]
    if (bestCSS) {
      bg = ensurePassSuitable(bestCSS.hex)
      method = 'css-direct'
      log(`STEP 4 ✓ CSS Direct: ${bestCSS.hex} (conf=${bestCSS.confidence.toFixed(2)}) → ${bg}`)
    } else {
      log(`STEP 4 ✗ CSS Direct: no eligible bg candidates (need conf≥0.5 + lum≤0.9)`)
    }
  } else if (!bg) {
    log(`STEP 4 ✗ CSS Direct: no candidates`)
  }

  // ─── STEP 5: Logo Color Darkened ──────────────────────────
  if (!bg && logoColor && logoColor.saturation >= 0.1) {
    bg = darkenHSL(logoColor.hex, 0.15)
    method = 'logo-darkened'
    log(`STEP 5 ✓ Logo Darkened: ${logoColor.hex} → ${bg}`)
  } else if (!bg) {
    log(`STEP 5 ✗ Logo Darkened: ${logoColor ? `sat=${logoColor.saturation.toFixed(2)} (< 0.1)` : 'no logo color'}`)
  }

  // ─── STEP 6: Vibrant Palette ──────────────────────────────
  if (!bg && palette) {
    if (!isBoringColor(palette.dominant)) {
      bg = ensurePassSuitable(palette.dominant)
      accent = palette.accent
      method = 'vibrant-palette'
      log(`STEP 6 ✓ Vibrant Palette: ${palette.dominant} → ${bg}`)
    } else {
      const bestSwatch = palette.swatches
        .filter(s => s.saturation >= 0.15)
        .sort((a, b) => b.saturation - a.saturation)[0]
      if (bestSwatch) {
        bg = ensurePassSuitable(bestSwatch.hex)
        method = 'vibrant-swatch'
        log(`STEP 6 ✓ Vibrant Swatch: ${bestSwatch.hex} (sat=${bestSwatch.saturation.toFixed(2)}) → ${bg}`)
      } else {
        log(`STEP 6 ✗ Vibrant: dominant boring, no saturated swatches (${palette.swatches.map(s => `${s.hex}:${s.saturation.toFixed(2)}`).join(', ')})`)
      }
    }
  } else if (!bg) {
    log(`STEP 6 ✗ Vibrant: no palette`)
  }

  // ─── STEP 7: GMaps Photo ──────────────────────────────────
  if (!bg && gmapsPhotoBuffer) {
    try {
      const photoPalette = await extractPalette(gmapsPhotoBuffer)
      if (!isBoringColor(photoPalette.dominant)) {
        bg = ensurePassSuitable(photoPalette.dominant)
        accent = photoPalette.accent
        method = 'gmaps-photo'
        log(`STEP 7 ✓ GMaps Photo: ${photoPalette.dominant} → ${bg}`)
      } else {
        log(`STEP 7 ✗ GMaps Photo: dominant ${photoPalette.dominant} is boring`)
      }
    } catch { log('STEP 7 ✗ GMaps Photo: extraction failed') }
  } else if (!bg) {
    log(`STEP 7 ✗ GMaps Photo: ${gmapsPhotoBuffer ? 'skipped' : 'no buffer'}`)
  }

  // ─── STEP 8: Industry Default ─────────────────────────────
  if (!bg && industryDefaults?.default_color) {
    bg = industryDefaults.default_color
    accent = industryDefaults.default_accent ?? null
    method = 'industry-default'
    log(`STEP 8 ✓ Industry Default: bg=${bg}, accent=${accent}`)
  } else if (!bg) {
    log(`STEP 8 ✗ Industry Default: ${industryDefaults ? 'no default_color' : 'no industry'}`)
  }

  // ─── STEP 9: Fallback ────────────────────────────────────
  if (!bg) {
    bg = '#1a1a2e'
    method = 'fallback'
    log('STEP 9 → Fallback #1a1a2e')
  }

  // ═══ FOREGROUND (text) ═════════════════════════════════════
  const bgRgb = hexToRgb(bg)
  const bgLum = relativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b)
  const whiteContrast = contrastRatio(1.0, bgLum)
  const blackContrast = contrastRatio(bgLum, 0.0)
  const textColor = whiteContrast >= blackContrast ? '#ffffff' : '#000000'

  // ═══ LABEL COLOR (brand-aware) ═════════════════════════════

  let labelColor: string | null = null

  // Strategy A0: AI accent (even if AI BG was rejected)
  if (!labelColor && aiAccentOnly) {
    if (wcagContrastRatio(aiAccentOnly, bg) >= 3.0) {
      labelColor = aiAccentOnly
      log(`Label: using AI accent (BG-rejected) ${aiAccentOnly}`)
    } else {
      const lightened = ensureLabelContrast(aiAccentOnly, bg)
      if (wcagContrastRatio(lightened, bg) >= 3.0) {
        labelColor = lightened
        log(`Label: using lightened AI accent ${aiAccentOnly} → ${lightened}`)
      }
    }
  }

  // Strategy A: Brand accent from CSS (if WCAG ≥ 3:1 on BG)
  if (!labelColor && accent) {
    if (wcagContrastRatio(accent, bg) >= 3.0) {
      labelColor = accent
    }
  }

  // Also check ALL CSS candidates for saturated brand colors (not just accent-role)
  // Prefer: saturated colors (red, orange, blue) over grays
  if (!labelColor) {
    const labelCandidates = cssCandidates
      .filter(c => c.hex !== bg && perceptualDistance(c.hex, bg!) > 60)
      .map(c => ({ ...c, sat: colorSaturation(c.hex) }))
      .sort((a, b) => {
        // Highly saturated first, then by confidence
        if (a.sat >= 0.3 && b.sat < 0.3) return -1
        if (b.sat >= 0.3 && a.sat < 0.3) return 1
        return b.confidence - a.confidence
      })

    for (const c of labelCandidates) {
      if (wcagContrastRatio(c.hex, bg) >= 3.0) {
        labelColor = c.hex
        log(`Label: CSS candidate ${c.hex} (sat=${c.sat.toFixed(2)}, ${c.source})`)
        break
      }
      // Try adjusting for WCAG
      const adjusted = ensureLabelContrast(c.hex, bg)
      if (wcagContrastRatio(adjusted, bg) >= 3.0 && colorSaturation(adjusted) >= 0.15) {
        labelColor = adjusted
        log(`Label: adjusted CSS candidate ${c.hex} → ${adjusted}`)
        break
      }
    }
  }

  // Strategy B: Logo color as label (if ≠ BG + WCAG ≥ 3:1)
  // Skip if logo color is desaturated (gray) — not a brand signal
  if (!labelColor && logoColor && logoColor.saturation >= 0.08) {
    const dist = perceptualDistance(logoColor.hex, bg)
    if (dist > 80 && wcagContrastRatio(logoColor.hex, bg) >= 3.0) {
      labelColor = logoColor.hex
    }
  }

  // Strategy C: HSL derivation from background (or any saturated source)
  if (!labelColor) {
    const bgHsl = hexToHsl(bg)
    // If BG is neutral/desaturated, try to borrow hue from a CSS candidate
    let sourceHsl = bgHsl
    if (bgHsl.s < 0.1) {
      // Look for any saturated CSS candidate to borrow hue from
      const saturatedCandidate = cssCandidates
        .filter(c => colorSaturation(c.hex) > 0.2)
        .sort((a, b) => b.confidence - a.confidence)[0]
      if (saturatedCandidate) {
        sourceHsl = hexToHsl(saturatedCandidate.hex)
      } else if (websiteContext.themeColor) {
        // Try theme-color meta tag
        const themeSat = colorSaturation(websiteContext.themeColor)
        if (themeSat > 0.15) {
          sourceHsl = hexToHsl(websiteContext.themeColor)
        }
      }
    }
    const targetL = bgHsl.l < 0.5 ? 0.6 : 0.35
    const derived = hslToHex(sourceHsl.h, Math.max(sourceHsl.s, 0.15), targetL)
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

  log(`RESULT: bg=${bg} text=${textColor} label=${labelColor} method=${method}`)

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
