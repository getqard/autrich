import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/leads/[id]/triage-action
 *
 * Stage 1 Aktionen:
 * - approve:  triage_status='approved' → Lead wird in Phase-A-Batch aufgenommen.
 * - reject:   triage_status='rejected' + pipeline_status='blacklisted' → Lead verschwindet aus Pipeline.
 * - skip:     triage_status='skipped' (wird bei späterem Swipe-Run nicht mehr angezeigt).
 *
 * Optionale Inline-Edits (beim approve): name, website_url.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const body = await request.json() as {
    action: 'approve' | 'reject' | 'skip'
    name?: string
    website_url?: string
  }

  const updateData: Record<string, unknown> = {}

  if (body.action === 'approve') {
    updateData.triage_status = 'approved'
    if (body.name && body.name.trim()) updateData.business_name = body.name.trim()
    if (body.website_url !== undefined) {
      updateData.website_url = body.website_url.trim() || null
    }
  } else if (body.action === 'reject') {
    updateData.triage_status = 'rejected'
    updateData.pipeline_status = 'blacklisted'
  } else if (body.action === 'skip') {
    // No DB change — Lead bleibt auf 'pending' und kommt beim nächsten Triage-Run wieder.
    return NextResponse.json({ success: true, action: 'skip' })
  } else {
    return NextResponse.json({ error: 'Unbekannte Action' }, { status: 400 })
  }

  const { error } = await supabase.from('leads').update(updateData).eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, action: body.action })
}
