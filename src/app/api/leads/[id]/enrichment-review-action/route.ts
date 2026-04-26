import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { addLeadEmailToBlacklist } from '@/lib/leads/blacklist'

/**
 * POST /api/leads/[id]/enrichment-review-action
 *
 * Stage 2 Aktionen:
 * - approve:   enrichment_review_status='approved' → Batch Phase B generiert Pass+Email.
 * - reject:    enrichment_review_status='rejected' + pipeline_status='blacklisted'.
 * - skip:      enrichment_review_status='skipped'.
 * - reenrich:  enrichment_status='pending', enrichment_review_status='pending'
 *              → Batch Phase A läuft nochmal (wenn triage_status='approved' ist).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const body = await request.json() as {
    action: 'approve' | 'reject' | 'skip' | 'reenrich'
  }

  const updateData: Record<string, unknown> = {}

  switch (body.action) {
    case 'approve':
      updateData.enrichment_review_status = 'approved'
      break
    case 'reject':
      updateData.enrichment_review_status = 'rejected'
      updateData.pipeline_status = 'blacklisted'
      await addLeadEmailToBlacklist(supabase, id, 'rejected_in_enrichment_review')
      break
    case 'skip':
      // No DB change — Lead bleibt 'pending' und kommt beim nächsten Review-Run wieder.
      return NextResponse.json({ success: true, action: 'skip' })
    case 'reenrich':
      updateData.enrichment_status = 'pending'
      updateData.enrichment_review_status = 'pending'
      break
    default:
      return NextResponse.json({ error: 'Unbekannte Action' }, { status: 400 })
  }

  const { error } = await supabase.from('leads').update(updateData).eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, action: body.action })
}
