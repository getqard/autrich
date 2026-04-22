import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/campaigns/[id]/enrichment-review-leads
 *
 * Stage 2: Leads nach Enrichment, vor Pass+Email-Generation.
 * Filter: enrichment_status='completed' AND enrichment_review_status='pending'.
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
    .eq('enrichment_status', 'completed')
    .eq('enrichment_review_status', 'pending')

  const { data: leads, error } = await supabase
    .from('leads')
    .select(`
      id, business_name, email, city, website_url, address,
      logo_url, logo_source,
      dominant_color, text_color, label_color, accent_color,
      strip_image_url, strip_source,
      detected_industry, detected_reward, detected_reward_emoji,
      detected_stamp_emoji, detected_pass_title, detected_max_stamps,
      email_hooks, personalization_notes,
      website_description, has_existing_loyalty, has_app,
      google_rating, google_reviews_count,
      contact_name, instagram_handle, instagram_followers,
      extra_data, lead_score
    `)
    .eq('campaign_id', id)
    .eq('enrichment_status', 'completed')
    .eq('enrichment_review_status', 'pending')
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
