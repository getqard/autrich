import { Vibrant } from 'node-vibrant/node'

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

// ─── HSL Conversion ─────────────────────────────────────────

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex)
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h, s, l }
}

export function hslToHex(h: number, s: number, l: number): string {
  if (s === 0) {
    const v = Math.round(l * 255)
    return rgbToHex(v, v, v)
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return rgbToHex(
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  )
}

// ─── Perceptual Distance (Redmean) ─────────────────────────

/**
 * Perceptual color distance using the Redmean formula.
 * More accurate than Euclidean RGB distance for human perception.
 * Range: 0 (identical) to ~765.
 */
export function perceptualDistance(a: string, b: string): number {
  const c1 = hexToRgb(a)
  const c2 = hexToRgb(b)
  const rmean = (c1.r + c2.r) / 2
  const dr = c1.r - c2.r
  const dg = c1.g - c2.g
  const db = c1.b - c2.b
  return Math.sqrt(
    (2 + rmean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rmean) / 256) * db * db
  )
}

// ─── HSL-based Darken/Lighten ───────────────────────────────

/**
 * Darken a color via HSL — preserves hue and saturation.
 * Yellow stays deep gold instead of muddy olive.
 */
export function darkenHSL(hex: string, targetL: number = 0.2): string {
  const hsl = hexToHsl(hex)
  return hslToHex(hsl.h, hsl.s, Math.min(hsl.l, targetL))
}

/**
 * Lighten a color via HSL — for label derivation.
 * Same hue, brighter version.
 */
export function lightenHSL(hex: string, targetL: number = 0.55): string {
  const hsl = hexToHsl(hex)
  return hslToHex(hsl.h, hsl.s, Math.max(hsl.l, targetL))
}

// ─── Pass-Suitable Color Enforcement ────────────────────────

/**
 * Ensure a color is suitable for a pass background (luminance 0.05–0.45).
 * Uses HSL darkening/lightening to preserve the hue.
 */
export function ensurePassSuitable(hex: string): string {
  const lum = hexLuminance(hex)
  if (lum >= 0.05 && lum <= 0.45) return hex
  if (lum > 0.45) return darkenHSL(hex, 0.2)
  // Too dark — lighten slightly
  return lightenHSL(hex, 0.12)
}

// ─── WCAG Contrast ──────────────────────────────────────────

/**
 * WCAG 2.0 contrast ratio between two hex colors.
 * Range: 1:1 (identical) to 21:1 (black/white).
 */
export function wcagContrastRatio(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1)
  const c2 = hexToRgb(hex2)
  const lum1 = relativeLuminance(c1.r, c1.g, c1.b)
  const lum2 = relativeLuminance(c2.r, c2.g, c2.b)
  return contrastRatio(lum1, lum2)
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

// ─── Logo Content Color Extraction (Dual-Pass) ─────────────

/**
 * Dual-pass logo content color extraction.
 *
 * Pass A: Flatten on BLACK → detects light content (white, gold, etc.)
 * Pass B: Flatten on WHITE → detects dark content (black text, dark logos)
 * Winner: whichever pass finds more content pixels.
 *
 * This handles ALL logo types:
 * - White text on transparent → Pass A wins
 * - Dark text on transparent → Pass B wins
 * - Colored content → both detect it, more pixels wins
 */
export async function extractLogoContentColor(imageBuffer: Buffer): Promise<{
  hex: string
  luminance: number
  saturation: number
} | null> {
  const { default: sharpMod } = await import('sharp')

  const size = 64

  // Pass A: flatten on black → detect light content
  const passA = await sharpMod(imageBuffer)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Pass B: flatten on white → detect dark content
  const passB = await sharpMod(imageBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixelCount = size * size

  function averagePass(data: Buffer, skipNear: 'black' | 'white'): { r: number; g: number; b: number; count: number } {
    let totalR = 0, totalG = 0, totalB = 0, count = 0
    for (let i = 0; i < pixelCount; i++) {
      const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2]
      if (skipNear === 'black' && r < 15 && g < 15 && b < 15) continue
      if (skipNear === 'white' && r > 240 && g > 240 && b > 240) continue
      totalR += r; totalG += g; totalB += b; count++
    }
    return count > 0
      ? { r: Math.round(totalR / count), g: Math.round(totalG / count), b: Math.round(totalB / count), count }
      : { r: 0, g: 0, b: 0, count: 0 }
  }

  const resultA = averagePass(passA.data, 'black')
  const resultB = averagePass(passB.data, 'white')

  // Pick the pass with more content pixels
  const winner = resultA.count >= resultB.count ? resultA : resultB

  if (winner.count < 50) return null

  const hex = rgbToHex(winner.r, winner.g, winner.b)
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
 * Uses HSV saturation via colorSaturation() for consistency.
 */
export function isBoringColor(hex: string): boolean {
  const lum = hexLuminance(hex)
  const sat = colorSaturation(hex)
  return sat < 0.12 || lum < 0.08 || lum > 0.92
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

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`
}

export function mixColors(base: string, mix: string, ratio: number): string {
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

export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

export function contrastRatio(lum1: number, lum2: number): number {
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  return (lighter + 0.05) / (darker + 0.05)
}

