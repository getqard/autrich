import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/campaigns/[id]/triage-leads
 *
 * Stage 1: Leads nach Scraping, vor Enrichment.
 * Filter: triage_status='pending'. Sortiert nach lead_score DESC.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const url = new URL(request.url)
  const offset = parseInt(url.searchParams.get('offset') || '0')
  const limit = parseInt(url.searchParams.get('limit') || '20')

  const { count: totalCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)
    .eq('triage_status', 'pending')

  const { data: leads, error } = await supabase
    .from('leads')
    .select(`
      id, business_name, email, city, address, postal_code, bundesland,
      website_url, phone, lat, lng,
      industry, gmaps_category, google_rating, google_reviews_count,
      opening_hours, social_links, extra_data, gmaps_photos,
      logo_url, instagram_handle, instagram_bio, instagram_followers,
      contact_name, lead_score, source, triage_status
    `)
    .eq('campaign_id', id)
    .eq('triage_status', 'pending')
    .order('lead_score', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    leads: leads || [],
    total: totalCount || 0,
    offset,
    limit,
  })
}
