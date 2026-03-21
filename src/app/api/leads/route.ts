import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/leads — List leads with filters
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const campaign_id = searchParams.get('campaign_id')
  const pipeline_status = searchParams.get('pipeline_status')
  const enrichment_status = searchParams.get('enrichment_status')
  const pass_status = searchParams.get('pass_status')
  const email_status = searchParams.get('email_status')
  const search = searchParams.get('search')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const offset = (page - 1) * limit

  const supabase = createServiceClient()
  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })

  if (campaign_id) query = query.eq('campaign_id', campaign_id)
  if (pipeline_status) query = query.eq('pipeline_status', pipeline_status)
  if (enrichment_status) query = query.eq('enrichment_status', enrichment_status)
  if (pass_status) query = query.eq('pass_status', pass_status)
  if (email_status) query = query.eq('email_status', email_status)
  if (search) query = query.or(`business_name.ilike.%${search}%,email.ilike.%${search}%,city.ilike.%${search}%`)

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    leads: data,
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  })
}
