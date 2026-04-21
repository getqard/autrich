import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/campaigns/[id]/review-leads
 *
 * Returns leads ready for QC review (pass generated + email in review).
 * Includes email_variants for strategy switching.
 * Sorted by lead_score DESC (best leads first).
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

  // Count total reviewable leads
  const { count: totalCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)
    .eq('pass_status', 'ready')
    .eq('email_status', 'review')

  // Fetch leads with fields needed for review
  const { data: leads, error } = await supabase
    .from('leads')
    .select(`
      id, business_name, email, city, website_url,
      logo_url, logo_source,
      dominant_color, text_color, label_color, accent_color,
      strip_image_url, strip_source,
      detected_industry, detected_reward, detected_reward_emoji,
      detected_stamp_emoji, detected_pass_title, detected_max_stamps,
      email_subject, email_body, email_strategy, email_variants,
      ab_group, ab_group_override,
      google_rating, google_reviews_count,
      contact_name, pass_status, email_status, lead_score,
      download_page_slug, pass_serial
    `)
    .eq('campaign_id', id)
    .eq('pass_status', 'ready')
    .eq('email_status', 'review')
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
