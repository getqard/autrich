import { geminiText, extractJson } from './gemini'
import { INDUSTRIES } from '@/data/industries-seed'
import { mapGmapsCategory } from '@/data/gmaps-category-map'
import type { ClassifyInput, ClassificationResult } from '@/lib/enrichment/types'

// ─── Industry Classification (instant, $0) ──────────────────

/**
 * Classify business industry without AI.
 * Priority: gmaps_category mapping → CSV industry mapping → keyword in name → null
 */
export function classifyIndustry(
  gmapsCategory: string | null,
  allCategories: string[],
  businessName: string,
  csvIndustry: string | null,
): { industry: string; method: 'gmaps' | 'csv' | 'keyword' } | null {
  // 1. GMaps category mapping
  const gmapsMatch = mapGmapsCategory(gmapsCategory, allCategories)
  if (gmapsMatch) return { industry: gmapsMatch, method: 'gmaps' }

  // 2. CSV industry mapping
  if (csvIndustry) {
    const csvLower = csvIndustry.toLowerCase()
    const csvMatch = INDUSTRIES.find(ind =>
      ind.slug === csvLower ||
      ind.name.toLowerCase() === csvLower ||
      ind.search_terms.some(t => t.toLowerCase() === csvLower)
    )
    if (csvMatch) return { industry: csvMatch.slug, method: 'csv' }
  }

  // 3. Keyword in business name
  const nameLower = businessName.toLowerCase()
  const nameMatch = INDUSTRIES.find(ind =>
    ind.search_terms.some(term => nameLower.includes(term.toLowerCase()))
  )
  if (nameMatch) return { industry: nameMatch.slug, method: 'keyword' }

  // 4. No match — AI needed
  return null
}

// ─── Creative Content Generation (Gemini Flash) ─────────────

export type CreativeContentInput = {
  business_name: string
  industry: string
  city?: string | null
  website_description?: string | null
  gmaps_category?: string | null
  categories?: string[]
  google_rating?: number | null
  google_reviews_count?: number | null
  has_existing_loyalty?: boolean
  has_app?: boolean
  social_links?: Record<string, string>
}

export type CreativeContentResult = {
  detected_reward: string
  detected_reward_emoji: string
  detected_stamp_emoji: string
  detected_pass_title: string
  detected_max_stamps: number
  strip_prompt: string
  email_hooks: string[]
  personalization_notes: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  duration_ms: number
}

const CREATIVE_SYSTEM_PROMPT = `Du generierst personalisierte Inhalte für eine digitale Treuekarte.
Die Branche ist bereits festgelegt — du musst sie NICHT bestimmen.

Antworte NUR mit validem JSON in diesem exakten Format:
{
  "detected_reward": "1 Gratis Döner",
  "detected_reward_emoji": "🥙",
  "detected_stamp_emoji": "🥙",
  "detected_pass_title": "Treuekarte",
  "detected_max_stamps": 10,
  "strip_prompt": "Turkish kebab restaurant, warm tones, appetizing food photography style",
  "email_hooks": [
    "Erster personalisierter Hook...",
    "Zweiter personalisierter Hook...",
    "Dritter personalisierter Hook..."
  ],
  "personalization_notes": "Kurze Notiz zur Personalisierung"
}

REGELN:
- detected_reward: Konkreter Gratis-Artikel passend zur Branche
- detected_reward_emoji + detected_stamp_emoji: Passend zur Branche
- detected_pass_title: "Treuekarte", "Stempelkarte" oder "Bonuskarte"
- detected_max_stamps: 8-12 je nach Branche (häufige Besuche = weniger Stempel)
- strip_prompt: Englisch, für AI Image Generation, beschreibt das Business visuell
- email_hooks: 3 verschiedene Angles auf Deutsch, personalisiert mit den echten Daten
- personalization_notes: Kurze Notiz was bei diesem Business besonders ist

Antworte NUR mit dem JSON, kein Text davor oder danach.`

function buildCreativePrompt(data: CreativeContentInput): string {
  const lines: string[] = [
    `Business Name: ${data.business_name}`,
    `Branche: ${data.industry}`,
  ]

  if (data.city) lines.push(`Stadt: ${data.city}`)
  if (data.website_description) lines.push(`Website Beschreibung: ${data.website_description}`)
  if (data.gmaps_category) lines.push(`Google Maps Kategorie: ${data.gmaps_category}`)
  if (data.google_rating) lines.push(`Google Rating: ${data.google_rating} (${data.google_reviews_count || 0} Reviews)`)
  if (data.has_existing_loyalty) lines.push(`Hat bereits ein Treueprogramm: Ja`)
  if (data.has_app) lines.push(`Hat eigene App: Ja`)
  if (data.social_links) {
    const links = Object.entries(data.social_links)
      .map(([platform, handle]) => `${platform}: ${handle}`)
      .join(', ')
    if (links) lines.push(`Social Media: ${links}`)
  }

  return lines.join('\n')
}

/**
 * Generate creative content using Gemini Flash (~10x cheaper than Haiku).
 */
export async function generateCreativeContent(
  data: CreativeContentInput
): Promise<CreativeContentResult> {
  const start = Date.now()
  const industryData = INDUSTRIES.find(i => i.slug === data.industry)

  try {
    const result = await geminiText(
      CREATIVE_SYSTEM_PROMPT,
      buildCreativePrompt(data),
      { maxTokens: 1024, temperature: 0.7 }
    )

    const jsonStr = extractJson(result.text)
    const parsed = JSON.parse(jsonStr)

    return {
      detected_reward: parsed.detected_reward || industryData?.default_reward || '1 Gratis Artikel',
      detected_reward_emoji: parsed.detected_reward_emoji || industryData?.emoji || '🎁',
      detected_stamp_emoji: parsed.detected_stamp_emoji || industryData?.default_stamp_emoji || '⭐',
      detected_pass_title: parsed.detected_pass_title || 'Treuekarte',
      detected_max_stamps: parsed.detected_max_stamps || industryData?.default_max_stamps || 10,
      strip_prompt: parsed.strip_prompt || '',
      email_hooks: Array.isArray(parsed.email_hooks) ? parsed.email_hooks : [],
      personalization_notes: parsed.personalization_notes || '',
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd,
      duration_ms: Date.now() - start,
    }
  } catch (err) {
    console.error('Gemini Creative Content generation failed, using fallback:', err)
    return creativeContentFallback(data.industry, data, start)
  }
}

function creativeContentFallback(
  industry: string,
  data: CreativeContentInput,
  start: number,
): CreativeContentResult {
  const matched = INDUSTRIES.find(i => i.slug === industry)
    || INDUSTRIES.find(i => i.slug === 'restaurant')!

  return {
    detected_reward: matched.default_reward || '1 Gratis Artikel',
    detected_reward_emoji: matched.emoji || '🎁',
    detected_stamp_emoji: matched.default_stamp_emoji || '⭐',
    detected_pass_title: 'Treuekarte',
    detected_max_stamps: matched.default_max_stamps || 10,
    strip_prompt: `${matched.name} business, professional, inviting atmosphere`,
    email_hooks: [
      `${data.business_name} könnte mit einer digitalen Stempelkarte mehr Stammkunden gewinnen.`,
      `In ${data.city || 'der Stadt'} setzen immer mehr Geschäfte auf digitale Kundenbindung.`,
      `Eine Treuekarte direkt im Wallet — kein Drucken, kein Vergessen.`,
    ],
    personalization_notes: `Fallback-Inhalte (kein AI). Branche: ${matched.name}`,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
    duration_ms: Date.now() - start,
  }
}

// ─── Full AI Classification (Gemini Flash) ──────────────────

const FULL_SYSTEM_PROMPT = `Du bist ein Business-Classifier für lokale Geschäfte in Deutschland.
Deine Aufgabe: Klassifiziere das Business und generiere Daten für eine digitale Treuekarte.

VERFÜGBARE INDUSTRIES (wähle die passendste):
doener, barber, cafe, pizzeria, baeckerei, restaurant, shisha, nagelstudio,
kosmetik, fitnessstudio, waschanlage, eisdiele, sushi, burger, blumenladen,
imbiss, tattoo, yogastudio, tierhandlung, reinigung

Falls keine passt, verwende die nächstähnliche.

Antworte NUR mit validem JSON in diesem exakten Format:
{
  "detected_industry": "doener",
  "detected_reward": "1 Gratis Döner",
  "detected_reward_emoji": "🥙",
  "detected_stamp_emoji": "🥙",
  "detected_pass_title": "Treuekarte",
  "detected_max_stamps": 10,
  "strip_prompt": "Turkish kebab restaurant, warm tones, appetizing food photography style",
  "email_hooks": [
    "Erster personalisierter Hook...",
    "Zweiter personalisierter Hook...",
    "Dritter personalisierter Hook..."
  ],
  "personalization_notes": "Kurze Notiz zur Personalisierung"
}

REGELN:
- detected_industry: Einer der oben genannten Slugs
- detected_reward: Konkreter Gratis-Artikel passend zur Branche
- detected_reward_emoji + detected_stamp_emoji: Passend zur Branche
- detected_pass_title: "Treuekarte", "Stempelkarte" oder "Bonuskarte"
- detected_max_stamps: 8-12 je nach Branche (häufige Besuche = weniger Stempel)
- strip_prompt: Englisch, für AI Image Generation, beschreibt das Business visuell
- email_hooks: 3 verschiedene Angles auf Deutsch, personalisiert mit den echten Daten des Business
- personalization_notes: Kurze Notiz was bei diesem Business besonders ist

Antworte NUR mit dem JSON, kein Text davor oder danach.`

function buildUserPrompt(data: ClassifyInput): string {
  const lines: string[] = [
    `Business Name: ${data.business_name}`,
  ]

  if (data.industry) lines.push(`Branche (aus CSV/GMaps): ${data.industry}`)
  if (data.gmaps_category) lines.push(`Google Maps Kategorie: ${data.gmaps_category}`)
  if (data.categories?.length) lines.push(`Alle GMaps Kategorien: ${data.categories.join(', ')}`)
  if (data.city) lines.push(`Stadt: ${data.city}`)
  if (data.website_description) lines.push(`Website Beschreibung: ${data.website_description}`)
  if (data.google_rating) lines.push(`Google Rating: ${data.google_rating} (${data.google_reviews_count || 0} Reviews)`)
  if (data.has_existing_loyalty) lines.push(`Hat bereits ein Treueprogramm: Ja`)
  if (data.has_app) lines.push(`Hat eigene App: Ja`)
  if (data.social_links) {
    const links = Object.entries(data.social_links)
      .map(([platform, handle]) => `${platform}: ${handle}`)
      .join(', ')
    if (links) lines.push(`Social Media: ${links}`)
  }

  return lines.join('\n')
}

/**
 * Full AI classification — used ONLY when classifyIndustry() returns null.
 * Uses Gemini Flash (~10x cheaper than Haiku).
 */
export async function classifyBusiness(data: ClassifyInput): Promise<ClassificationResult> {
  const start = Date.now()

  try {
    const result = await geminiText(
      FULL_SYSTEM_PROMPT,
      buildUserPrompt(data),
      { maxTokens: 1024, temperature: 0.5 }
    )

    const jsonStr = extractJson(result.text)
    const parsed = JSON.parse(jsonStr)

    return {
      detected_industry: parsed.detected_industry || 'restaurant',
      detected_reward: parsed.detected_reward || '1 Gratis Artikel',
      detected_reward_emoji: parsed.detected_reward_emoji || '🎁',
      detected_stamp_emoji: parsed.detected_stamp_emoji || '⭐',
      detected_pass_title: parsed.detected_pass_title || 'Treuekarte',
      detected_max_stamps: parsed.detected_max_stamps || 10,
      strip_prompt: parsed.strip_prompt || '',
      email_hooks: Array.isArray(parsed.email_hooks) ? parsed.email_hooks : [],
      personalization_notes: parsed.personalization_notes || '',
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd,
      duration_ms: Date.now() - start,
    }
  } catch (err) {
    console.error('Gemini Classification failed, using keyword fallback:', err)
    return keywordFallback(data, start)
  }
}

function keywordFallback(data: ClassifyInput, start: number): ClassificationResult {
  const searchText = [
    data.business_name,
    data.industry,
    data.gmaps_category,
    data.website_description,
    ...(data.categories || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  let matchedIndustry = INDUSTRIES.find(ind =>
    ind.search_terms.some(term => searchText.includes(term.toLowerCase()))
  )

  if (!matchedIndustry) {
    matchedIndustry = INDUSTRIES.find(ind => ind.slug === 'restaurant')!
  }

  return {
    detected_industry: matchedIndustry.slug,
    detected_reward: matchedIndustry.default_reward || '1 Gratis Artikel',
    detected_reward_emoji: matchedIndustry.emoji || '🎁',
    detected_stamp_emoji: matchedIndustry.default_stamp_emoji || '⭐',
    detected_pass_title: 'Treuekarte',
    detected_max_stamps: matchedIndustry.default_max_stamps || 10,
    strip_prompt: `${matchedIndustry.name} business, professional, inviting atmosphere`,
    email_hooks: [
      `${data.business_name} könnte mit einer digitalen Stempelkarte mehr Stammkunden gewinnen.`,
      `In ${data.city || 'der Stadt'} setzen immer mehr Geschäfte auf digitale Kundenbindung.`,
      `Eine Treuekarte direkt im Wallet — kein Drucken, kein Vergessen.`,
    ],
    personalization_notes: `Keyword-basierte Klassifizierung (kein AI). Branche: ${matchedIndustry.name}`,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
    duration_ms: Date.now() - start,
  }
}
