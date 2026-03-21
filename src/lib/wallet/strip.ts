/**
 * Strip Template Matching
 *
 * Given an industry slug and a background color, finds the best matching
 * pre-generated strip template. Uses HSL distance for color matching.
 *
 * Flow:
 *   1. Find templates for the industry
 *   2. Compare bg_color against each variant's hex range
 *   3. Return closest match
 *   4. No match? → Imagen fallback (strip-generator.ts)
 */

import { createServiceClient } from '@/lib/supabase/server'
import type { StripTemplate } from '@/lib/supabase/types'

// ─── Color Variant Definitions ───────────────────────────────────

export const COLOR_VARIANTS = [
  { name: 'dark', hueRange: [0, 360], satRange: [0, 100], lumRange: [0, 25] },
  { name: 'warm', hueRange: [15, 45], satRange: [30, 100], lumRange: [20, 55] },
  { name: 'earthy', hueRange: [20, 50], satRange: [15, 60], lumRange: [20, 45] },
  { name: 'vibrant', hueRange: [0, 360], satRange: [60, 100], lumRange: [30, 60] },
] as const

export type ColorVariantName = 'dark' | 'warm' | 'earthy' | 'vibrant'

// ─── HSL Utilities ───────────────────────────────────────────────

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const cleaned = hex.replace('#', '')
  const r = parseInt(cleaned.substring(0, 2), 16) / 255
  const g = parseInt(cleaned.substring(2, 4), 16) / 255
  const b = parseInt(cleaned.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 }
  }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return { h: h * 360, s: s * 100, l: l * 100 }
}

/**
 * Calculate HSL distance between two hex colors.
 * Returns a score 0-100 where 0 = identical.
 */
function hslDistance(hex1: string, hex2: string): number {
  const c1 = hexToHSL(hex1)
  const c2 = hexToHSL(hex2)

  // Hue is circular (0-360)
  let hueDiff = Math.abs(c1.h - c2.h)
  if (hueDiff > 180) hueDiff = 360 - hueDiff

  const satDiff = Math.abs(c1.s - c2.s)
  const lumDiff = Math.abs(c1.l - c2.l)

  // Weight: luminance matters most for strip readability
  return (hueDiff / 360) * 30 + (satDiff / 100) * 30 + (lumDiff / 100) * 40
}

/**
 * Detect which color variant a hex color belongs to.
 */
export function detectColorVariant(hex: string): ColorVariantName {
  const { h, s, l } = hexToHSL(hex)

  // Dark colors (low luminance)
  if (l < 25) return 'dark'

  // Vibrant colors (high saturation)
  if (s > 60 && l >= 30 && l <= 60) return 'vibrant'

  // Warm colors (orange-brown hue range)
  if (h >= 15 && h <= 45 && s >= 30) return 'warm'

  // Earthy colors (similar hue but lower saturation)
  if (h >= 20 && h <= 50 && s >= 15 && s < 60) return 'earthy'

  // Default to dark for very desaturated or very light
  if (l > 60) return 'vibrant'

  return 'dark'
}

// ─── Template Matching ───────────────────────────────────────────

export type StripMatchResult = {
  template: StripTemplate
  variant: string
  distance: number
  imageUrl: string
}

/**
 * Find the best matching strip template for an industry + color.
 * Returns null if no templates exist for the industry.
 */
export async function matchStripTemplate(
  industrySlug: string,
  bgColor: string,
): Promise<StripMatchResult | null> {
  const supabase = createServiceClient()

  // Fetch all templates for this industry
  const { data: templates } = await supabase
    .from('strip_templates')
    .select('*')
    .or(`industry_slug.eq.${industrySlug},industry.eq.${industrySlug}`)

  if (!templates || templates.length === 0) return null

  // Find closest match by color distance
  let bestMatch: StripMatchResult | null = null
  let bestDistance = Infinity

  for (const template of templates) {
    // Use hex_range_start as the reference color for distance calculation
    const refColor = template.hex_range_start || getVariantReferenceColor(template.color_variant)
    const distance = hslDistance(bgColor, refColor)

    if (distance < bestDistance) {
      bestDistance = distance
      const { data: publicUrl } = supabase.storage
        .from('strip-templates')
        .getPublicUrl(template.storage_path || template.image_url)

      bestMatch = {
        template,
        variant: template.color_variant,
        distance,
        imageUrl: template.storage_path ? publicUrl.publicUrl : template.image_url,
      }
    }
  }

  return bestMatch
}

/**
 * Get all templates for an industry.
 */
export async function getIndustryTemplates(industrySlug: string): Promise<StripTemplate[]> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('strip_templates')
    .select('*')
    .or(`industry_slug.eq.${industrySlug},industry.eq.${industrySlug}`)
    .order('color_variant')

  return data || []
}

/**
 * Get all templates grouped by industry.
 */
export async function getAllTemplates(): Promise<Map<string, StripTemplate[]>> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('strip_templates')
    .select('*')
    .order('industry_slug')
    .order('color_variant')

  const grouped = new Map<string, StripTemplate[]>()
  if (data) {
    for (const template of data) {
      const key = template.industry_slug || template.industry
      const group = grouped.get(key) || []
      group.push(template)
      grouped.set(key, group)
    }
  }

  return grouped
}

/**
 * Default reference color for each variant (used when hex_range_start is missing).
 */
function getVariantReferenceColor(variant: string): string {
  switch (variant) {
    case 'dark': return '#1a1a2e'
    case 'warm': return '#8B4513'
    case 'earthy': return '#5C4033'
    case 'vibrant': return '#B22222'
    default: return '#1a1a2e'
  }
}
