import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/campaigns/[id]/triage-bulk
 *
 * Bulk-Aktionen für Stage 1 Triage:
 *  - approve_all: alle triage_status='pending' → 'approved'
 *  - reject_all:  alle triage_status='pending' → 'rejected' + pipeline_status='blacklisted'
 *
 * Bequemlichkeit für Lano: nach 50 Scrape-Imports nicht 50× Enter drücken.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = (body as { action?: string }).action

  if (action !== 'approve_all' && action !== 'reject_all') {
    return NextResponse.json({ error: 'action muss "approve_all" oder "reject_all" sein' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Erst Count holen für Response
  const { count } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)
    .eq('triage_status', 'pending')

  if (!count) {
    return NextResponse.json({ updated: 0, message: 'Keine pending Leads in Stage 1' })
  }

  const update: Record<string, unknown> =
    action === 'approve_all'
      ? { triage_status: 'approved' }
      : { triage_status: 'rejected', pipeline_status: 'blacklisted' }

  const { error } = await supabase
    .from('leads')
    .update(update)
    .eq('campaign_id', id)
    .eq('triage_status', 'pending')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    updated: count,
    action,
  })
}
