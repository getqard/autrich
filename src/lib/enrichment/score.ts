import type { Lead } from '@/lib/supabase/types'

export function calculateLeadScore(lead: Partial<Lead>): number {
  let score = 0

  if (lead.email) score += 20
  if (lead.website_url) score += 10
  if (lead.phone) score += 5
  if ((lead.google_rating ?? 0) >= 4) score += 10
  if ((lead.google_reviews_count ?? 0) >= 50) score += 10
  if (lead.social_links?.instagram || lead.instagram_handle) score += 5
  if (!lead.has_existing_loyalty) score += 15
  if (!lead.has_app) score += 10
  if (lead.logo_url) score += 5
  if (lead.enrichment_status === 'completed') score += 10

  return Math.min(score, 100)
}
