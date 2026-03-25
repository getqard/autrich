/**
 * Strip Template Matching — Accent-Family Based
 *
 * Templates are organized by industry × accent color family.
 * The accent family is detected from the lead's labelColor (hue-based).
 * Matching uses a 4-tier fallback: exact → neutral → generic+family → generic+neutral.
 *
 * Templates are stored RAW (no gradient). The gradient fade is applied
 * at runtime with the lead's actual backgroundColor via applyStripGradient().
 */

import { createServiceClient } from '@/lib/supabase/server'
import type { StripTemplate, AccentFamily } from '@/lib/supabase/types'

// ─── Accent Family Definitions ──────────────────────────────────

export type { AccentFamily } from '@/lib/supabase/types'

export type PromptCategory = 'food' | 'service' | 'retail'

export const ACCENT_FAMILIES: ReadonlyArray<{
  name: AccentFamily
  label: string
  representative: string
  hueMin: number
  hueMax: number
  aiHint: string
}> = [
  { name: 'warm',    label: 'Warm/Golden',   representative: '#D4A574', hueMin: 20,  hueMax: 65,  aiHint: 'golden amber warm candlelight, sunset glow, cozy elegance' },
  { name: 'red',     label: 'Red/Crimson',   representative: '#DC2626', hueMin: 345, hueMax: 20,  aiHint: 'crimson fire dramatic red, bold intensity, fiery energy' },
  { name: 'cool',    label: 'Cool/Blue',     representative: '#3B82F6', hueMin: 175, hueMax: 255, aiHint: 'blue neon cool steel, clean modern, crisp precision' },
  { name: 'green',   label: 'Green/Natural',  representative: '#22C55E', hueMin: 65,  hueMax: 175, aiHint: 'green fresh natural emerald, organic vitality, zen' },
  { name: 'pink',    label: 'Pink/Rose',     representative: '#EC4899', hueMin: 295, hueMax: 345, aiHint: 'pink rose feminine luxe, soft glamour, pastel elegance' },
  { name: 'purple',  label: 'Purple/Violet', representative: '#8B5CF6', hueMin: 255, hueMax: 295, aiHint: 'purple violet luxury mystic, deep regal atmosphere' },
  { name: 'neutral', label: 'Neutral/Dark',  representative: '#808080', hueMin: 0,   hueMax: 360, aiHint: 'dark moody neutral cinematic, sophisticated monochrome' },
]

/**
 * Which prompt category each industry belongs to.
 * Food: food must stay warm-lit, accent ONLY in environment.
 * Service: accent can be everywhere.
 * Retail: accent in products + environment.
 */
export const INDUSTRY_PROMPT_CATEGORY: Record<string, PromptCategory> = {
  doener: 'food',
  cafe: 'food',
  pizzeria: 'food',
  baeckerei: 'food',
  restaurant: 'food',
  sushi: 'food',
  burger: 'food',
  eisdiele: 'food',
  imbiss: 'food',
  barber: 'service',
  nagelstudio: 'service',
  kosmetik: 'service',
  fitnessstudio: 'service',
  waschanlage: 'service',
  tattoo: 'service',
  yogastudio: 'service',
  reinigung: 'service',
  blumenladen: 'retail',
  tierhandlung: 'retail',
  shisha: 'retail',
  // Erweiterte Branchen
  tuerkisch: 'food',
  asiatisch: 'food',
  griechisch: 'food',
  mexikanisch: 'food',
  indisch: 'food',
  bar: 'service',
  brunch: 'food',
  bierbar: 'food',
  apotheke: 'service',
  autowerkstatt: 'service',
  handyladen: 'service',
  massage: 'service',
  hundepflege: 'retail',
  fahrradladen: 'service',
}

// ─── Accent Family Detection ────────────────────────────────────

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const cleaned = hex.replace('#', '')
  const r = parseInt(cleaned.substring(0, 2), 16) / 255
  const g = parseInt(cleaned.substring(2, 4), 16) / 255
  const b = parseInt(cleaned.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return { h: h * 360, s, l }
}

/**
 * Detect which accent family a hex color belongs to.
 * Uses hue-based classification with saturation gate.
 */
export function detectAccentFamily(hex: string): AccentFamily {
  const { h, s } = hexToHSL(hex)

  // Low saturation → neutral (grays, blacks, whites)
  if (s < 0.15) return 'neutral'

  // Hue-based classification
  if (h >= 345 || h < 20) return 'red'
  if (h >= 20 && h < 65) return 'warm'
  if (h >= 65 && h < 175) return 'green'
  if (h >= 175 && h < 255) return 'cool'
  if (h >= 255 && h < 295) return 'purple'
  if (h >= 295 && h < 345) return 'pink'

  return 'neutral'
}

/**
 * Get the family definition for a given accent family name.
 */
export function getAccentFamilyDef(family: AccentFamily) {
  return ACCENT_FAMILIES.find(f => f.name === family)!
}

// ─── Template Matching ──────────────────────────────────────────

export type StripMatchResult = {
  template: StripTemplate
  accentFamily: AccentFamily
  tier: 1 | 2 | 3 | 4
  imageUrl: string
}

/**
 * Find the best matching strip template with 4-tier fallback.
 *
 * Tier 1: exact industry + exact accent family
 * Tier 2: exact industry + neutral fallback
 * Tier 3: generic + exact accent family
 * Tier 4: generic + neutral (absolute last resort)
 *
 * Returns null if no templates exist at all → caller falls back to on-demand AI.
 */
export async function matchStripTemplate(
  industrySlug: string,
  accentColor: string | null,
): Promise<StripMatchResult | null> {
  const family = accentColor ? detectAccentFamily(accentColor) : 'neutral'
  const supabase = createServiceClient()

  // Tier 1: Exact industry + exact family
  let template = await findTemplate(supabase, industrySlug, family)
  if (template) return buildResult(template, family, 1, supabase)

  // Tier 2: Exact industry + neutral
  if (family !== 'neutral') {
    template = await findTemplate(supabase, industrySlug, 'neutral')
    if (template) return buildResult(template, 'neutral', 2, supabase)
  }

  // Tier 3: Generic + exact family
  template = await findTemplate(supabase, 'generic', family)
  if (template) return buildResult(template, family, 3, supabase)

  // Tier 4: Generic + neutral
  template = await findTemplate(supabase, 'generic', 'neutral')
  if (template) return buildResult(template, 'neutral', 4, supabase)

  return null
}

async function findTemplate(
  supabase: ReturnType<typeof createServiceClient>,
  industrySlug: string,
  accentFamily: AccentFamily,
): Promise<StripTemplate | null> {
  const { data } = await supabase
    .from('strip_templates')
    .select('*')
    .eq('industry_slug', industrySlug)
    .eq('accent_family', accentFamily)
    .limit(1)
    .single()

  return data as StripTemplate | null
}

function buildResult(
  template: StripTemplate,
  family: AccentFamily,
  tier: 1 | 2 | 3 | 4,
  supabase: ReturnType<typeof createServiceClient>,
): StripMatchResult {
  let imageUrl = template.image_url
  if (template.storage_path) {
    const { data } = supabase.storage
      .from('strip-templates')
      .getPublicUrl(template.storage_path)
    imageUrl = data.publicUrl
  }

  return { template, accentFamily: family, tier, imageUrl }
}

// ─── List Templates ─────────────────────────────────────────────

export async function getIndustryTemplates(industrySlug: string): Promise<StripTemplate[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('strip_templates')
    .select('*')
    .eq('industry_slug', industrySlug)
    .order('accent_family')

  return (data || []) as StripTemplate[]
}

export async function getAllTemplates(): Promise<Map<string, StripTemplate[]>> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('strip_templates')
    .select('*')
    .order('industry_slug')
    .order('accent_family')

  const grouped = new Map<string, StripTemplate[]>()
  if (data) {
    for (const template of data as StripTemplate[]) {
      const key = template.industry_slug
      const group = grouped.get(key) || []
      group.push(template)
      grouped.set(key, group)
    }
  }

  return grouped
}
