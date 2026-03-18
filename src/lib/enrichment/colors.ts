import { Vibrant } from 'node-vibrant/node'
import type { PassColorResult } from './types'

export type PaletteResult = {
  dominant: string
  accent: string | null
  textColor: string
  labelColor: string
  swatches: Array<{ name: string; hex: string; population: number }>
}

/**
 * Extract a full color palette from an image buffer using node-vibrant.
 * Mapping: DarkVibrant → dominant (pass bg), Vibrant → accent, Muted → label base.
 * Falls back through available swatches if preferred ones are null.
 */
export async function extractPalette(imageBuffer: Buffer): Promise<PaletteResult> {
  const palette = await Vibrant.from(imageBuffer).getPalette()

  const swatches: PaletteResult['swatches'] = []
  const swatchNames = ['Vibrant', 'Muted', 'DarkVibrant', 'DarkMuted', 'LightVibrant', 'LightMuted'] as const

  for (const name of swatchNames) {
    const s = palette[name]
    if (s) {
      swatches.push({ name, hex: s.hex, population: s.population })
    }
  }

  // Dominant: DarkVibrant → DarkMuted → Muted → first available
  const dominant =
    palette.DarkVibrant?.hex ??
    palette.DarkMuted?.hex ??
    palette.Muted?.hex ??
    swatches[0]?.hex ??
    '#1a1a2e'

  // Accent: Vibrant → LightVibrant → null
  const accent = palette.Vibrant?.hex ?? palette.LightVibrant?.hex ?? null

  // Text & label colors via WCAG
  const luminance = hexLuminance(dominant)
  const textColor = luminance > 0.5 ? '#000000' : '#ffffff'
  const labelColor = palette.Muted?.hex ?? mixColors(dominant, textColor, 0.3)

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

// ─── Utility Functions ──────────────────────────────────────

function hexLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function mixColors(base: string, mix: string, ratio: number): string {
  const b = hexToRgb(base)
  const m = hexToRgb(mix)
  const r = Math.round(b.r * (1 - ratio) + m.r * ratio)
  const g = Math.round(b.g * (1 - ratio) + m.g * ratio)
  const bl = Math.round(b.b * (1 - ratio) + m.b * ratio)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
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
