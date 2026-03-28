import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runPipelineForLead } from '@/lib/pipeline/run-single-lead'

export const maxDuration = 300 // 5 minutes (Vercel Fluid Compute)

type BatchProgress = {
  status: 'idle' | 'running' | 'completed' | 'failed'
  total: number
  completed: number
  failed: number
  current_lead_name?: string
  started_at?: string
  completed_at?: string
  failed_leads?: Array<{ id: string; name: string; error: string }>
}

/**
 * GET /api/campaigns/[id]/batch-pipeline
 * Returns current batch progress.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: campaign, error } = await supabase
    .from('campaigns').select('settings').eq('id', id).single()

  if (error || !campaign) {
    return NextResponse.json({ error: 'Campaign nicht gefunden' }, { status: 404 })
  }

  const settings = (campaign.settings || {}) as Record<string, unknown>
  const progress = (settings.batch_progress || { status: 'idle', total: 0, completed: 0, failed: 0 }) as BatchProgress

  // Also return counts of leads in different states
  const { count: pendingCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)
    .or('enrichment_status.eq.pending,pass_status.eq.pending,email_status.eq.pending')

  const { count: readyCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)
    .eq('email_status', 'review')

  const { count: totalCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)

  return NextResponse.json({
    ...progress,
    leads: {
      total: totalCount || 0,
      pending: pendingCount || 0,
      ready_for_review: readyCount || 0,
    },
  })
}

/**
 * POST /api/campaigns/[id]/batch-pipeline
 *
 * Processes the next chunk of leads (max 10 per invocation).
 * Client polls GET and re-triggers POST until all leads are done.
 *
 * Body: { action?: 'start' | 'continue' | 'stop' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()
  const body = await request.json().catch(() => ({}))
  const action = (body as { action?: string }).action || 'continue'

  // Determine base URL
  const baseUrl = request.headers.get('host')
    ? `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`
    : process.env.NEXT_PUBLIC_BASE_URL || 'https://autrich.vercel.app'

  // Load campaign
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns').select('*').eq('id', id).single()

  if (campErr || !campaign) {
    return NextResponse.json({ error: 'Campaign nicht gefunden' }, { status: 404 })
  }

  const settings = (campaign.settings || {}) as Record<string, unknown>
  const progress = (settings.batch_progress || {
    status: 'idle', total: 0, completed: 0, failed: 0, failed_leads: [],
  }) as BatchProgress

  // Handle stop action
  if (action === 'stop') {
    progress.status = 'idle'
    await updateProgress(supabase, id, settings, progress)
    return NextResponse.json({ ...progress, message: 'Batch gestoppt' })
  }

  // Prevent double-trigger
  if (progress.status === 'running') {
    // Check if it's been running for too long (stuck, > 6 min)
    const startedAt = progress.started_at ? new Date(progress.started_at).getTime() : 0
    if (Date.now() - startedAt < 360000) {
      return NextResponse.json({ error: 'Batch läuft bereits' }, { status: 409 })
    }
    // Stuck — reset and continue
    console.log(`[Batch] Previous run appears stuck (${Date.now() - startedAt}ms), resetting`)
  }

  // Find leads that need processing
  // A lead needs processing if it hasn't gone through the full pipeline yet
  const { data: pendingLeads, error: leadsErr } = await supabase
    .from('leads')
    .select('id, business_name, website_url')
    .eq('campaign_id', id)
    .not('website_url', 'is', null)
    .or('enrichment_status.eq.pending,pass_status.eq.pending,email_status.eq.pending')
    .order('created_at', { ascending: true })
    .limit(10)  // Max 10 per chunk (~20s each = ~200s, under 300s limit)

  if (leadsErr) {
    return NextResponse.json({ error: `Leads laden fehlgeschlagen: ${leadsErr.message}` }, { status: 500 })
  }

  if (!pendingLeads || pendingLeads.length === 0) {
    // All done
    progress.status = 'completed'
    progress.completed_at = new Date().toISOString()
    await updateProgress(supabase, id, settings, progress)

    // Update campaign status
    await supabase.from('campaigns').update({ status: 'ready' }).eq('id', id)

    return NextResponse.json({ ...progress, message: 'Alle Leads verarbeitet' })
  }

  // Count total pending (for progress tracking)
  if (action === 'start' || progress.status === 'idle' || progress.status === 'completed') {
    const { count: totalPending } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', id)
      .not('website_url', 'is', null)
      .or('enrichment_status.eq.pending,pass_status.eq.pending,email_status.eq.pending')

    progress.total = (totalPending || 0) + progress.completed
    progress.completed = progress.status === 'completed' ? 0 : progress.completed
    progress.failed = progress.status === 'completed' ? 0 : progress.failed
    progress.failed_leads = progress.status === 'completed' ? [] : (progress.failed_leads || [])
    progress.started_at = new Date().toISOString()
  }

  // Mark as running
  progress.status = 'running'
  await updateProgress(supabase, id, settings, progress)

  // Update campaign status
  await supabase.from('campaigns').update({ status: 'processing' }).eq('id', id)

  // Process leads one by one
  let chunkCompleted = 0
  let chunkFailed = 0

  for (const lead of pendingLeads) {
    // Check if stopped (re-read progress)
    if (chunkCompleted > 0 && chunkCompleted % 3 === 0) {
      const { data: freshCampaign } = await supabase
        .from('campaigns').select('settings').eq('id', id).single()
      const freshSettings = (freshCampaign?.settings || {}) as Record<string, unknown>
      const freshProgress = freshSettings.batch_progress as BatchProgress | undefined
      if (freshProgress?.status === 'idle') {
        console.log(`[Batch] Stop requested, halting after ${chunkCompleted} leads`)
        break
      }
    }

    progress.current_lead_name = lead.business_name
    await updateProgress(supabase, id, settings, progress)

    console.log(`[Batch] Processing lead ${progress.completed + 1}/${progress.total}: ${lead.business_name}`)

    try {
      const result = await runPipelineForLead(lead.id, supabase, baseUrl)

      if (result.success) {
        progress.completed++
        chunkCompleted++
        console.log(`[Batch] ✓ ${lead.business_name} (${result.durationMs}ms)`)
      } else {
        progress.failed++
        chunkFailed++
        progress.failed_leads = progress.failed_leads || []
        progress.failed_leads.push({ id: lead.id, name: lead.business_name, error: result.error || 'Unknown' })
        console.log(`[Batch] ✗ ${lead.business_name}: ${result.error}`)
      }
    } catch (err) {
      progress.failed++
      chunkFailed++
      progress.failed_leads = progress.failed_leads || []
      progress.failed_leads.push({ id: lead.id, name: lead.business_name, error: err instanceof Error ? err.message : 'Exception' })
      console.log(`[Batch] ✗ ${lead.business_name}: ${err instanceof Error ? err.message : err}`)
    }

    // Update progress after each lead
    await updateProgress(supabase, id, settings, progress)
  }

  // Check if there are more leads to process
  const { count: remainingCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)
    .not('website_url', 'is', null)
    .or('enrichment_status.eq.pending,pass_status.eq.pending,email_status.eq.pending')

  if (!remainingCount || remainingCount === 0) {
    progress.status = 'completed'
    progress.completed_at = new Date().toISOString()
    progress.current_lead_name = undefined
    await supabase.from('campaigns').update({ status: 'ready' }).eq('id', id)
  } else {
    // More leads remaining — stay 'running' so client triggers next chunk
    progress.status = 'running'
  }

  await updateProgress(supabase, id, settings, progress)

  return NextResponse.json({
    ...progress,
    chunk: { processed: chunkCompleted + chunkFailed, succeeded: chunkCompleted, failed: chunkFailed },
    remaining: remainingCount || 0,
  })
}

async function updateProgress(
  supabase: ReturnType<typeof createServiceClient>,
  campaignId: string,
  settings: Record<string, unknown>,
  progress: BatchProgress,
) {
  await supabase.from('campaigns').update({
    settings: { ...settings, batch_progress: progress },
  }).eq('id', campaignId)
}
