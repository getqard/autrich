/**
 * Generic-Mockup-Builder
 *
 * Baut Mockup-Daten OHNE gescrapte Logos/Brand-Colors.
 * Stattdessen: Industry-Emoji + Industry-Default-Color + harte WCAG-Logik.
 *
 * Strategie:
 *   - Logo-Bereich = großes Emoji der Branche (🥙, ✂️, 🍕, ...)
 *   - Background = INDUSTRIES.default_color
 *   - Text/Label = via WCAG-Kontrast (Schwarz oder Weiß)
 *   - Strip = bleibt wie scraped (Industry-Pattern via matchStripTemplate)
 *   - Final-Fallback: pures Schwarz/Weiß wenn Industry unbekannt
 */

import { INDUSTRIES } from '@/data/industries-seed'
import { relativeLuminance, contrastRatio, hexToRgb } from '@/lib/enrichment/colors'
import type { Lead } from '@/lib/supabase/types'

export type GenericMockupColors = {
  dominant_color: string
  text_color: string
  label_color: string
  industry_emoji: string | null
  source: 'industry-default' | 'monochrome-fallback'
}

const MONOCHROME_FALLBACK: GenericMockupColors = {
  dominant_color: '#0a0a0a',
  text_color: '#ffffff',
  label_color: '#a3a3a3',
  industry_emoji: '⭐',
  source: 'monochrome-fallback',
}

/**
 * Wählt Schwarz oder Weiß als Text-Farbe — was auch immer mehr Kontrast hat.
 */
function pickTextColor(bgHex: string): '#ffffff' | '#000000' {
  const bg = hexToRgb(bgHex)
  const bgLum = relativeLuminance(bg.r, bg.g, bg.b)
  const whiteContrast = contrastRatio(1.0, bgLum)
  const blackContrast = contrastRatio(bgLum, 0.0)
  return whiteContrast >= blackContrast ? '#ffffff' : '#000000'
}

/**
 * Wählt eine Label-Farbe mit harter WCAG-Garantie (Kontrast ≥ 3.0).
 * Strategie:
 *   1. Versuche industry.default_accent → check WCAG
 *   2. Wenn fail: nimm einen Grauton der definitiv lesbar ist
 *      (auf dunkelem BG: hell-grau, auf hellem BG: dunkel-grau)
 */
function pickLabelColor(bgHex: string, accentHex: string | null): string {
  const bg = hexToRgb(bgHex)
  const bgLum = relativeLuminance(bg.r, bg.g, bg.b)

  // Try accent first
  if (accentHex && /^#[0-9a-fA-F]{6}$/.test(accentHex)) {
    const accent = hexToRgb(accentHex)
    const accentLum = relativeLuminance(accent.r, accent.g, accent.b)
    if (contrastRatio(accentLum, bgLum) >= 3.0) {
      return accentHex
    }
  }

  // Hardgate fallback: light-gray on dark BG, dark-gray on light BG
  return bgLum < 0.4 ? '#c0c0c0' : '#404040'
}

/**
 * Baut Generic-Mockup-Daten für einen Lead.
 *
 * Wenn lead.detected_industry in INDUSTRIES gefunden wird:
 *   → Industry-Default-Farben + Emoji
 * Sonst:
 *   → Pures Schwarz mit weißem Text + Stern-Emoji
 */
export function buildGenericMockup(lead: Lead): GenericMockupColors {
  const industrySlug = lead.detected_industry || lead.industry || null
  if (!industrySlug) return MONOCHROME_FALLBACK

  const industry = INDUSTRIES.find(i => i.slug === industrySlug)
  if (!industry) return MONOCHROME_FALLBACK

  const bg = industry.default_color || '#0a0a0a'
  const text = pickTextColor(bg)
  const label = pickLabelColor(bg, industry.default_accent || null)

  return {
    dominant_color: bg,
    text_color: text,
    label_color: label,
    industry_emoji: industry.emoji || '⭐',
    source: 'industry-default',
  }
}

/**
 * Mappt Industry-Slug zu Emoji ohne kompletten Lead-Kontext.
 * Nützlich für Listen-Ansichten oder UI-Previews.
 */
export function getIndustryEmoji(industrySlug: string | null): string | null {
  if (!industrySlug) return null
  return INDUSTRIES.find(i => i.slug === industrySlug)?.emoji || null
}
