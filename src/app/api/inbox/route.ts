import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/inbox
 *
 * Liefert alle Leads die geantwortet haben (email_status='replied'),
 * neueste zuerst. Plus Anzahl ungelesener (reply_seen_at IS NULL).
 *
 * Query-Params:
 *   campaign_id  — nur Replies einer Campaign
 *   unread_only  — true → nur ungelesene
 *   limit        — default 50
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const campaignId = url.searchParams.get('campaign_id')
  const unreadOnly = url.searchParams.get('unread_only') === 'true'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)

  const supabase = createServiceClient()

  let query = supabase
    .from('leads')
    .select(`
      id, business_name, email, contact_name, city, industry, logo_url,
      email_subject, email_body, email_replied_at, reply_text, reply_seen_at,
      pipeline_status, campaign_id,
      campaigns:campaign_id ( id, name )
    `)
    .eq('email_status', 'replied')
    .order('email_replied_at', { ascending: false })
    .limit(limit)

  if (campaignId) query = query.eq('campaign_id', campaignId)
  if (unreadOnly) query = query.is('reply_seen_at', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Unread-Count separat (für Badge)
  let unreadCountQuery = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('email_status', 'replied')
    .is('reply_seen_at', null)
  if (campaignId) unreadCountQuery = unreadCountQuery.eq('campaign_id', campaignId)
  const { count: unreadCount } = await unreadCountQuery

  return NextResponse.json({
    replies: data || [],
    unread_count: unreadCount || 0,
  })
}
