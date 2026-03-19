import { Vibrant } from 'node-vibrant/node'
import type { PassColorResult } from './types'

export type PaletteResult = {
  dominant: string
  accent: string | null
  textColor: string
  labelColor: string
  swatches: Array<{ name: string; hex: string; population: number; saturation: number }>
}

/**
 * Trim a logo to its content area, removing whitespace/transparency.
 * This is critical for color extraction — a gold text on 512x512 white canvas
 * is 90% white pixels. After trim, it's 100% gold.
 */
async function trimLogoForColorExtraction(imageBuffer: Buffer): Promise<Buffer> {
  const { default: sharpMod } = await import('sharp')
  try {
    // First flatten transparency to white, then trim white border
    const trimmed = await sharpMod(imageBuffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .trim({ threshold: 20 })
      .toBuffer()
    // Only use trimmed if it's at least 4x4 (trim can produce tiny results)
    const meta = await sharpMod(trimmed).metadata()
    if (meta.width && meta.height && meta.width >= 4 && meta.height >= 4) {
      return trimmed
    }
  } catch { /* trim failed, use original */ }
  return imageBuffer
}

/**
 * Calculate HSV saturation for a hex color (0-1).
 */
export function colorSaturation(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === 0) return 0
  return (max - min) / max
}

/**
 * Extract a full color palette from a logo image buffer.
 *
 * Key insight: Logos are different from photos. The DESIGNED color matters,
 * not the background filler. So we:
 * 1. Trim whitespace/transparency to isolate the logo content
 * 2. Rank swatches by saturation (not population) — the brand color
 *    is the most colorful part, even if it's fewer pixels
 * 3. Darken the most-saturated swatch for pass background suitability
 */
export async function extractPalette(imageBuffer: Buffer): Promise<PaletteResult> {
  // Trim logo to content area before extraction
  const trimmedBuffer = await trimLogoForColorExtraction(imageBuffer)

  const palette = await Vibrant.from(trimmedBuffer).getPalette()

  const swatches: PaletteResult['swatches'] = []
  const swatchNames = ['Vibrant', 'Muted', 'DarkVibrant', 'DarkMuted', 'LightVibrant', 'LightMuted'] as const

  for (const name of swatchNames) {
    const s = palette[name]
    if (s) {
      const sat = colorSaturation(s.hex)
      swatches.push({ name, hex: s.hex, population: s.population, saturation: sat })
    }
  }

  // ─── DOMINANT COLOR (for pass background) ────────────────
  // Strategy: Find the most saturated non-boring swatch, then ensure it's
  // dark enough for a pass background (target luminance 0.15-0.35).
  let dominant: string | null = null

  // A) Traditional chain — works great when logo has solid dark brand colors
  if (palette.DarkVibrant && !isBoringColor(palette.DarkVibrant.hex)) {
    dominant = palette.DarkVibrant.hex
  }
  if (!dominant && palette.Muted && !isBoringColor(palette.Muted.hex)) {
    dominant = palette.Muted.hex
  }
  if (!dominant && palette.DarkMuted && !isBoringColor(palette.DarkMuted.hex)) {
    dominant = palette.DarkMuted.hex
  }

  // B) Saturation-based fallback — when traditional chain fails (all boring),
  //    pick the most SATURATED swatch. This is the key fix for logos like
  //    gold text on white background: gold has high saturation, white has 0.
  if (!dominant) {
    const saturatedSwatches = swatches
      .filter(s => s.saturation >= 0.15)
      .sort((a, b) => b.saturation - a.saturation)

    if (saturatedSwatches.length > 0) {
      const best = saturatedSwatches[0]
      // Ensure it's dark enough for a pass background
      const lum = hexLuminance(best.hex)
      if (lum > 0.4) {
        // Too bright — darken to target luminance ~0.25
        const darkenAmount = Math.min(0.6, (lum - 0.25) / lum)
        dominant = darkenColor(best.hex, darkenAmount)
      } else {
        dominant = best.hex
      }
    }
  }

  // C) Last resort — any non-white swatch, darkened
  if (!dominant && palette.Vibrant) {
    dominant = darkenColor(palette.Vibrant.hex, 0.3)
  }
  if (!dominant) {
    dominant = swatches[0]?.hex ?? '#1a1a2e'
  }

  // ─── ACCENT COLOR ────────────────────────────────────────
  // The most saturated swatch that's different from dominant
  const accentCandidates = swatches
    .filter(s => s.hex !== dominant && s.saturation >= 0.1)
    .sort((a, b) => b.saturation - a.saturation)
  const accent = accentCandidates[0]?.hex
    ?? palette.Vibrant?.hex
    ?? palette.LightVibrant?.hex
    ?? null

  // Text & label colors via WCAG
  const luminance = hexLuminance(dominant)
  const textColor = luminance > 0.5 ? '#000000' : '#ffffff'
  const labelColor = accent
    ? mixColors(dominant, accent, 0.3)
    : (palette.Muted?.hex ?? mixColors(dominant, textColor, 0.3))

  return { dominant, accent, textColor, labelColor, swatches }
}

/**
 * Legacy single-color extraction (kept for backward compat but uses node-vibrant now).
 */
export async function extractColors(imageBuffer: Buffer): Promise<{
  dominant: string
  textColor: string
  labelColor: string
  luminance: number
}> {
  const palette = await extractPalette(imageBuffer)
  const luminance = hexLuminance(palette.dominant)
  return {
    dominant: palette.dominant,
    textColor: palette.textColor,
    labelColor: palette.labelColor,
    luminance,
  }
}

// ─── Logo Content Color Extraction ──────────────────────────

/**
 * Extract the actual content color of a logo by flattening on black
 * and averaging non-black pixels.
 *
 * Why: A white-text logo on transparent background is invisible to
 * node-vibrant (which sees only white). By flattening on black,
 * transparent pixels become black → we skip them and average the
 * real content pixels (white, gold, red, etc.).
 */
export async function extractLogoContentColor(imageBuffer: Buffer): Promise<{
  hex: string
  luminance: number
  saturation: number
} | null> {
  const { default: sharpMod } = await import('sharp')

  const { data, info } = await sharpMod(imageBuffer)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let totalR = 0, totalG = 0, totalB = 0
  let count = 0
  const pixelCount = info.width * info.height

  for (let i = 0; i < pixelCount; i++) {
    const r = data[i * 3]
    const g = data[i * 3 + 1]
    const b = data[i * 3 + 2]
    // Skip near-black pixels (were transparent before flatten)
    if (r < 15 && g < 15 && b < 15) continue
    totalR += r
    totalG += g
    totalB += b
    count++
  }

  // Too few content pixels → can't determine color
  if (count < 50) return null

  const avgR = Math.round(totalR / count)
  const avgG = Math.round(totalG / count)
  const avgB = Math.round(totalB / count)
  const hex = rgbToHex(avgR, avgG, avgB)

  return {
    hex,
    luminance: hexLuminance(hex),
    saturation: colorSaturation(hex),
  }
}

/**
 * Euclidean distance between two colors in RGB space.
 * Range: 0 (identical) to ~441 (black ↔ white).
 */
export function colorDistance(a: string, b: string): number {
  const c1 = hexToRgb(a)
  const c2 = hexToRgb(b)
  return Math.sqrt(
    (c1.r - c2.r) ** 2 +
    (c1.g - c2.g) ** 2 +
    (c1.b - c2.b) ** 2
  )
}

// ─── Utility Functions ──────────────────────────────────────

export function hexLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/**
 * Detect "boring" colors: near-black, near-white, or desaturated grays.
 * These are typically page-builder defaults (WordPress, Elementor) not brand colors.
 */
export function isBoringColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2 / 255
  const s = max === min ? 0 : (max - min) / (l > 0.5 ? (510 - max - min) : (max + min))
  // Low saturation, too dark, or too light
  return s < 0.12 || l < 0.08 || l > 0.92
}

/**
 * Darken a hex color by a factor (0-1). 0.2 = 20% darker.
 */
export function darkenColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const factor = 1 - amount
  return rgbToHex(
    Math.round(r * factor),
    Math.round(g * factor),
    Math.round(b * factor),
  )
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`
}

function mixColors(base: string, mix: string, ratio: number): string {
  const b = hexToRgb(base)
  const m = hexToRgb(mix)
  const r = Math.round(b.r * (1 - ratio) + m.r * ratio)
  const g = Math.round(b.g * (1 - ratio) + m.g * ratio)
  const bl = Math.round(b.b * (1 - ratio) + m.b * ratio)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function contrastRatio(lum1: number, lum2: number): number {
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Derive pass colors from brand background, with WCAG AA contrast guarantee.
 * Optionally checks logo contrast against background.
 */
export async function derivePassColors(
  bgHex: string,
  accentHex: string | null,
  logoBuffer: Buffer | null,
): Promise<PassColorResult> {
  const { default: sharp } = await import('sharp')
  const bg = hexToRgb(bgHex)
  const bgLum = relativeLuminance(bg.r, bg.g, bg.b)

  const whiteLum = 1.0
  const blackLum = 0.0
  const whiteContrast = contrastRatio(whiteLum, bgLum)
  const blackContrast = contrastRatio(bgLum, blackLum)
  const foregroundColor = whiteContrast >= blackContrast ? '#ffffff' : '#000000'

  const labelColor = mixColors(bgHex, foregroundColor, 0.3)

  let logoContrast: 'good' | 'low' | 'unknown' = 'unknown'
  if (logoBuffer) {
    try {
      const meta = await sharp(logoBuffer).metadata()
      const w = meta.width || 0
      const h = meta.height || 0
      if (w >= 4 && h >= 4) {
        const cornerSize = 1
        const corners = await Promise.all([
          sharp(logoBuffer).extract({ left: 0, top: 0, width: cornerSize, height: cornerSize }).removeAlpha().raw().toBuffer(),
          sharp(logoBuffer).extract({ left: w - 1, top: 0, width: cornerSize, height: cornerSize }).removeAlpha().raw().toBuffer(),
          sharp(logoBuffer).extract({ left: 0, top: h - 1, width: cornerSize, height: cornerSize }).removeAlpha().raw().toBuffer(),
          sharp(logoBuffer).extract({ left: w - 1, top: h - 1, width: cornerSize, height: cornerSize }).removeAlpha().raw().toBuffer(),
        ])

        const cx = Math.floor(w / 2)
        const cy = Math.floor(h / 2)
        const centerBuf = await sharp(logoBuffer)
          .extract({ left: cx, top: cy, width: 1, height: 1 })
          .removeAlpha().raw().toBuffer()

        const samples = [...corners, centerBuf]
        const avgLum = samples.reduce((sum, buf) => {
          return sum + relativeLuminance(buf[0], buf[1], buf[2])
        }, 0) / samples.length

        const lumDiff = Math.abs(avgLum - bgLum)
        logoContrast = lumDiff < 0.15 ? 'low' : 'good'
      }
    } catch {
      // Can't read logo pixels, leave as unknown
    }
  }

  return {
    backgroundColor: bgHex,
    foregroundColor,
    labelColor,
    accentColor: accentHex,
    logoContrast,
  }
}

/**
 * Adjust background color to improve contrast with a low-contrast logo.
 */
export function adjustBgForContrast(bgHex: string): string {
  const bg = hexToRgb(bgHex)
  const lum = (0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b) / 255
  const factor = lum < 0.5 ? 1.3 : 0.7
  const r = Math.max(0, Math.min(255, Math.round(bg.r * factor)))
  const g = Math.max(0, Math.min(255, Math.round(bg.g * factor)))
  const b = Math.max(0, Math.min(255, Math.round(bg.b * factor)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
