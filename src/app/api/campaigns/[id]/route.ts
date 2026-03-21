import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/campaigns/[id] — Campaign detail with stats
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !campaign) {
    return NextResponse.json({ error: 'Kampagne nicht gefunden' }, { status: 404 })
  }

  // Lead stats
  const { data: stats } = await supabase
    .from('leads')
    .select('enrichment_status, pass_status, email_status, pipeline_status')
    .eq('campaign_id', id)

  const leadStats = {
    total: stats?.length || 0,
    enrichment: { pending: 0, processing: 0, completed: 0, failed: 0 } as Record<string, number>,
    pass: { pending: 0, generating: 0, ready: 0, failed: 0 } as Record<string, number>,
    email: { pending: 0, review: 0, queued: 0, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 } as Record<string, number>,
    pipeline: { new: 0, contacted: 0, engaged: 0, interested: 0, demo_scheduled: 0, converted: 0, warm: 0, lost: 0, blacklisted: 0 } as Record<string, number>,
  }

  if (stats) {
    for (const lead of stats) {
      const row = lead as Record<string, string>
      if (row.enrichment_status in leadStats.enrichment) leadStats.enrichment[row.enrichment_status]++
      if (row.pass_status in leadStats.pass) leadStats.pass[row.pass_status]++
      if (row.email_status in leadStats.email) leadStats.email[row.email_status]++
      if (row.pipeline_status in leadStats.pipeline) leadStats.pipeline[row.pipeline_status]++
    }
  }

  return NextResponse.json({ ...campaign, stats: leadStats })
}

// PATCH /api/campaigns/[id] — Update campaign
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const supabase = createServiceClient()

  const allowedFields = ['name', 'status', 'settings']
  const updateData: Record<string, unknown> = {}
  for (const f of allowedFields) {
    if (f in body) updateData[f] = body[f]
  }

  const { data, error } = await supabase
    .from('campaigns')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
