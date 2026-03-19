/**
 * Unified Pass Color Determination — AI-First + Waterfall Fallback.
 *
 * Happy path: AI Vision picks bg + label → post-processing → done.
 * Fallback: 9-step waterfall (only when AI is unavailable).
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
  headerScreenshot?: Buffer | null
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
  // STEP 1: AI Vision (Happy Path)
  // ═══════════════════════════════════════════════════════════

  if (rasterLogo && headerScreenshot) {
    try {
      const aiColors = await pickBrandColors(rasterLogo, headerScreenshot)

      if (aiColors) {
        const bg = aiColors.background
        const textColor = deriveTextColor(bg)

        // Label from AI or fallback derivation
        let labelColor: string
        if (aiColors.label) {
          labelColor = ensureLabelContrast(aiColors.label, bg)
        } else {
          // AI didn't provide a usable label → derive from BG
          const bgHsl = hexToHsl(bg)
          labelColor = hslToHex(bgHsl.h, Math.max(bgHsl.s, 0.3), bgHsl.l < 0.5 ? 0.65 : 0.35)
          labelColor = ensureLabelContrast(labelColor, bg)
        }

        // Ensure label ≠ text
        if (labelColor === textColor) {
          const hsl = hexToHsl(labelColor)
          const bgHsl = hexToHsl(bg)
          labelColor = hslToHex(bgHsl.h, Math.max(0.15, bgHsl.s), hsl.l)
          labelColor = ensureLabelContrast(labelColor, bg)
        }

        const logoContrast = checkLogoContrast(bg, logoColor)

        log(`AI-First: bg=${bg} label=${labelColor} text=${textColor} method=ai-vision (confidence=${aiColors.confidence})`)

        return {
          backgroundColor: bg,
          accentColor: aiColors.label,
          textColor,
          labelColor,
          method: 'ai-vision',
          logoContentColor: logoColor,
          palette,
          logoContrast,
        }
      } else {
        log('AI Vision returned null → falling back to waterfall')
      }
    } catch (err) {
      log(`AI Vision ERROR: ${err instanceof Error ? err.message : err} → falling back to waterfall`)
    }
  } else {
    log(`AI Vision skipped: ${!rasterLogo ? 'no logo' : 'no screenshot'} → using waterfall`)
  }

  // ═══════════════════════════════════════════════════════════
  // FALLBACK: Waterfall (Steps 2-9 + Score-based label)
  // Only runs when AI is not available
  // ═══════════════════════════════════════════════════════════

  return waterfallFallback({
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
}

// ─── Waterfall Fallback ─────────────────────────────────────

async function waterfallFallback(ctx: {
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

  log('Fallback: using waterfall (no AI)')

  let bg: string | null = null
  let accent: string | null = null
  let method = 'fallback'

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
    log(`STEP 2 ✗ Header BG: not found`)
  }

  // ─── STEP 2b: High-confidence CSS brand variable ──────────
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
      log(`STEP 4 ✗ CSS Direct: no eligible bg candidates`)
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
        log(`STEP 6 ✗ Vibrant: dominant boring, no saturated swatches`)
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

  // ═══ TEXT COLOR ══════════════════════════════════════════════
  const textColor = deriveTextColor(bg)

  // ═══ LABEL COLOR (score-based) ═══════════════════════════════

  const FRAMEWORK_COLORS = new Set([
    '#007bff', '#0d6efd', '#6c757d', '#28a745', '#198754',
    '#dc3545', '#ffc107', '#17a2b8', '#0dcaf0', '#5cb85c',
    '#d9534f', '#f0ad4e', '#5bc0de', '#0075ff',
  ])

  type LabelCandidate = { hex: string; confidence: number; source: string; role?: string }

  const labelPool: LabelCandidate[] = []

  for (const c of cssCandidates) {
    if (c.hex.toLowerCase() === bg.toLowerCase()) continue
    if (perceptualDistance(c.hex, bg) < 30) continue
    labelPool.push({ hex: c.hex, confidence: c.confidence, source: c.source, role: c.role })
  }

  if (accent && !labelPool.some(c => c.hex.toLowerCase() === accent!.toLowerCase())) {
    labelPool.push({ hex: accent, confidence: 0.7, source: 'accent' })
  }

  if (logoColor && logoColor.saturation >= 0.08) {
    if (!labelPool.some(c => c.hex.toLowerCase() === logoColor!.hex.toLowerCase())) {
      labelPool.push({ hex: logoColor.hex, confidence: 0.6, source: 'logo-content' })
    }
  }

  // HSL derivation fallback
  {
    const bgHsl = hexToHsl(bg)
    let sourceHsl = bgHsl
    if (bgHsl.s < 0.1) {
      const saturatedCandidate = cssCandidates
        .filter(c => colorSaturation(c.hex) > 0.2)
        .sort((a, b) => b.confidence - a.confidence)[0]
      if (saturatedCandidate) {
        sourceHsl = hexToHsl(saturatedCandidate.hex)
      } else if (websiteContext.themeColor) {
        const themeSat = colorSaturation(websiteContext.themeColor)
        if (themeSat > 0.15) sourceHsl = hexToHsl(websiteContext.themeColor)
      }
    }
    const targetL = bgHsl.l < 0.5 ? 0.6 : 0.35
    const derived = hslToHex(sourceHsl.h, Math.max(sourceHsl.s, 0.15), targetL)
    labelPool.push({ hex: derived, confidence: 0.3, source: 'hsl-derived' })
  }

  // Score candidates
  function scoreLabelCandidate(hex: string, conf: number, role?: string, source?: string): { total: number; breakdown: string } {
    const sat = colorSaturation(hex)
    const wcag = wcagContrastRatio(hex, bg!)
    const lum = hexLuminance(hex)

    const satScore = sat * 35
    const confScore = conf * 25

    let clusterCount = 0
    for (const other of labelPool) {
      if (other.hex.toLowerCase() === hex.toLowerCase()) continue
      if (colorSaturation(other.hex) < 0.15) continue
      if (perceptualDistance(hex, other.hex) < 50) clusterCount++
    }
    const clusterNorm = sat >= 0.15 ? Math.min(clusterCount / 3, 1.0) : 0
    const clusterScore = clusterNorm * 25

    const wcagScore = wcag >= 3.0 ? 15 : (wcag >= 2.5 ? 8 : 0)
    const roleScore = role === 'accent' ? 10 : (role === 'background' ? -5 : 0)

    let total = satScore + confScore + clusterScore + wcagScore + roleScore

    const isNearWhite = lum > 0.85
    const isNearBlack = lum < 0.08
    if (isNearWhite || isNearBlack || sat < 0.1) total -= 15
    if (FRAMEWORK_COLORS.has(hex.toLowerCase())) total -= 10

    const breakdown = `sat=${sat.toFixed(2)}×35=${satScore.toFixed(0)} conf=${conf.toFixed(2)}×25=${confScore.toFixed(0)} cluster=${clusterCount}→${clusterScore.toFixed(0)} wcag=${wcag.toFixed(1)}→${wcagScore} role=${role ?? '-'}→${roleScore}`

    return { total, breakdown }
  }

  const scored = labelPool.map(c => {
    const { total, breakdown } = scoreLabelCandidate(c.hex, c.confidence, c.role, c.source)
    return { ...c, score: total, breakdown }
  }).sort((a, b) => b.score - a.score)

  const top3 = scored.slice(0, 3)
  log(`Label scores (${scored.length} candidates):`)
  for (const c of top3) {
    log(`  ${c.hex} score=${c.score.toFixed(0)} [${c.breakdown}] (${c.source})`)
  }

  let labelColor: string | null = null
  for (const c of scored) {
    if (wcagContrastRatio(c.hex, bg) >= 3.0) {
      labelColor = c.hex
      log(`Label: picked ${c.hex} (score=${c.score.toFixed(0)}, ${c.source})`)
      break
    }
    const adjusted = ensureLabelContrast(c.hex, bg)
    if (wcagContrastRatio(adjusted, bg) >= 3.0 && colorSaturation(adjusted) >= 0.15) {
      labelColor = adjusted
      log(`Label: adjusted ${c.hex} → ${adjusted} (score=${c.score.toFixed(0)}, ${c.source})`)
      break
    }
  }

  if (!labelColor) {
    labelColor = mixColors(bg, textColor, 0.35)
    log(`Label: fallback mix`)
  }

  labelColor = ensureLabelContrast(labelColor, bg)

  if (labelColor === textColor) {
    const hsl = hexToHsl(labelColor)
    const bgHsl = hexToHsl(bg)
    labelColor = hslToHex(bgHsl.h, Math.max(0.15, bgHsl.s), hsl.l)
    labelColor = ensureLabelContrast(labelColor, bg)
  }

  log(`RESULT: bg=${bg} text=${textColor} label=${labelColor} method=${method}`)

  // ═══ FINAL VALIDATION ══════════════════════════════════════

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
