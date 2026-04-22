import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runEnrichmentForLead, runPassEmailForLead } from '@/lib/pipeline/run-single-lead'

export const maxDuration = 300 // 5 minutes (Vercel Fluid Compute)

type BatchProgress = {
  status: 'idle' | 'running' | 'completed' | 'failed'
  total: number
  completed: number
  failed: number
  current_lead_name?: string
  current_phase?: 'enrichment' | 'pass_email'
  started_at?: string
  completed_at?: string
  failed_leads?: Array<{ id: string; name: string; error: string; phase: string }>
}

/**
 * GET /api/campaigns/[id]/batch-pipeline
 * Returns current batch progress + counts pro Phase.
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

  // Counts pro Stage (für Progress-UI in Campaign-Page)
  const [
    { count: awaitingTriage },
    { count: enrichmentQueue },
    { count: awaitingEnrichmentReview },
    { count: passEmailQueue },
    { count: readyForReview },
    { count: totalCount },
  ] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('campaign_id', id).eq('triage_status', 'pending'),
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('campaign_id', id).eq('triage_status', 'approved').eq('enrichment_status', 'pending')
      .not('website_url', 'is', null),
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('campaign_id', id).eq('enrichment_status', 'completed').eq('enrichment_review_status', 'pending'),
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('campaign_id', id).eq('enrichment_review_status', 'approved').eq('pass_status', 'pending'),
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('campaign_id', id).eq('email_status', 'review'),
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('campaign_id', id),
  ])

  return NextResponse.json({
    ...progress,
    leads: {
      total: totalCount || 0,
      awaiting_triage: awaitingTriage || 0,
      enrichment_queue: enrichmentQueue || 0,
      awaiting_enrichment_review: awaitingEnrichmentReview || 0,
      pass_email_queue: passEmailQueue || 0,
      ready_for_review: readyForReview || 0,
      // Legacy-Feld für bestehende UI-Kompatibilität
      pending: (enrichmentQueue || 0) + (passEmailQueue || 0),
    },
  })
}

/**
 * POST /api/campaigns/[id]/batch-pipeline
 *
 * Verarbeitet den nächsten Chunk von Leads (max 10 pro Aufruf).
 * Pickt in Reihenfolge:
 *   1. Phase A: Enrichment (triage_status='approved' AND enrichment_status='pending')
 *   2. Phase B: Pass+Email (enrichment_review_status='approved' AND pass_status='pending')
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

  const baseUrl = request.headers.get('host')
    ? `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`
    : process.env.NEXT_PUBLIC_BASE_URL || 'https://autrich.vercel.app'

  const { data: campaign, error: campErr } = await supabase
    .from('campaigns').select('*').eq('id', id).single()

  if (campErr || !campaign) {
    return NextResponse.json({ error: 'Campaign nicht gefunden' }, { status: 404 })
  }

  const settings = (campaign.settings || {}) as Record<string, unknown>
  const progress = (settings.batch_progress || {
    status: 'idle', total: 0, completed: 0, failed: 0, failed_leads: [],
  }) as BatchProgress

  if (action === 'stop') {
    progress.status = 'idle'
    await updateProgress(supabase, id, settings, progress)
    return NextResponse.json({ ...progress, message: 'Batch gestoppt' })
  }

  if (progress.status === 'running') {
    const startedAt = progress.started_at ? new Date(progress.started_at).getTime() : 0
    if (Date.now() - startedAt < 360000) {
      return NextResponse.json({ error: 'Batch läuft bereits' }, { status: 409 })
    }
    console.log(`[Batch] Previous run appears stuck (${Date.now() - startedAt}ms), resetting`)
  }

  // ───── Phase A: Enrichment-Queue ─────
  const { data: enrichLeads, error: enrichErr } = await supabase
    .from('leads')
    .select('id, business_name, website_url')
    .eq('campaign_id', id)
    .eq('triage_status', 'approved')
    .eq('enrichment_status', 'pending')
    .not('website_url', 'is', null)
    .order('lead_score', { ascending: false })
    .limit(10)

  if (enrichErr) {
    return NextResponse.json({ error: `Leads laden fehlgeschlagen: ${enrichErr.message}` }, { status: 500 })
  }

  // Totals über beide Phasen
  if (action === 'start' || progress.status === 'idle' || progress.status === 'completed') {
    const [{ count: enrichPending }, { count: passEmailPending }] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('campaign_id', id).eq('triage_status', 'approved').eq('enrichment_status', 'pending')
        .not('website_url', 'is', null),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('campaign_id', id).eq('enrichment_review_status', 'approved').eq('pass_status', 'pending'),
    ])
    const totalPending = (enrichPending || 0) + (passEmailPending || 0)

    progress.total = totalPending + progress.completed
    progress.completed = progress.status === 'completed' ? 0 : progress.completed
    progress.failed = progress.status === 'completed' ? 0 : progress.failed
    progress.failed_leads = progress.status === 'completed' ? [] : (progress.failed_leads || [])
    progress.started_at = new Date().toISOString()
  }

  progress.status = 'running'
  await updateProgress(supabase, id, settings, progress)
  await supabase.from('campaigns').update({ status: 'processing' }).eq('id', id)

  let chunkCompleted = 0
  let chunkFailed = 0

  // Phase A verarbeiten, falls Leads da sind
  if (enrichLeads && enrichLeads.length > 0) {
    progress.current_phase = 'enrichment'
    for (const lead of enrichLeads) {
      if (chunkCompleted > 0 && chunkCompleted % 3 === 0 && await stopRequested(supabase, id)) {
        console.log(`[Batch] Stop requested, halting after ${chunkCompleted} leads`)
        break
      }

      progress.current_lead_name = lead.business_name
      await updateProgress(supabase, id, settings, progress)
      console.log(`[Batch/Enrich] ${progress.completed + 1}/${progress.total}: ${lead.business_name}`)

      try {
        const result = await runEnrichmentForLead(lead.id, supabase, baseUrl)
        if (result.success) {
          progress.completed++
          chunkCompleted++
        } else {
          progress.failed++
          chunkFailed++
          progress.failed_leads = progress.failed_leads || []
          progress.failed_leads.push({ id: lead.id, name: lead.business_name, error: result.error || 'Unknown', phase: 'enrichment' })
        }
      } catch (err) {
        progress.failed++
        chunkFailed++
        progress.failed_leads = progress.failed_leads || []
        progress.failed_leads.push({ id: lead.id, name: lead.business_name, error: err instanceof Error ? err.message : 'Exception', phase: 'enrichment' })
      }
      await updateProgress(supabase, id, settings, progress)
    }
  } else {
    // Phase A leer → Phase B probieren
    const { data: passEmailLeads, error: peErr } = await supabase
      .from('leads')
      .select('id, business_name')
      .eq('campaign_id', id)
      .eq('enrichment_review_status', 'approved')
      .eq('pass_status', 'pending')
      .order('lead_score', { ascending: false })
      .limit(10)

    if (peErr) {
      return NextResponse.json({ error: `Leads laden fehlgeschlagen: ${peErr.message}` }, { status: 500 })
    }

    if (passEmailLeads && passEmailLeads.length > 0) {
      progress.current_phase = 'pass_email'
      for (const lead of passEmailLeads) {
        if (chunkCompleted > 0 && chunkCompleted % 3 === 0 && await stopRequested(supabase, id)) {
          console.log(`[Batch] Stop requested, halting after ${chunkCompleted} leads`)
          break
        }

        progress.current_lead_name = lead.business_name
        await updateProgress(supabase, id, settings, progress)
        console.log(`[Batch/PassEmail] ${progress.completed + 1}/${progress.total}: ${lead.business_name}`)

        try {
          const result = await runPassEmailForLead(lead.id, supabase, baseUrl)
          if (result.success) {
            progress.completed++
            chunkCompleted++
          } else {
            progress.failed++
            chunkFailed++
            progress.failed_leads = progress.failed_leads || []
            progress.failed_leads.push({ id: lead.id, name: lead.business_name, error: result.error || 'Unknown', phase: 'pass_email' })
          }
        } catch (err) {
          progress.failed++
          chunkFailed++
          progress.failed_leads = progress.failed_leads || []
          progress.failed_leads.push({ id: lead.id, name: lead.business_name, error: err instanceof Error ? err.message : 'Exception', phase: 'pass_email' })
        }
        await updateProgress(supabase, id, settings, progress)
      }
    }
  }

  // Remaining über beide Phasen prüfen
  const [{ count: enrichRem }, { count: peRem }] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('campaign_id', id).eq('triage_status', 'approved').eq('enrichment_status', 'pending')
      .not('website_url', 'is', null),
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('campaign_id', id).eq('enrichment_review_status', 'approved').eq('pass_status', 'pending'),
  ])
  const remaining = (enrichRem || 0) + (peRem || 0)

  if (remaining === 0) {
    progress.status = 'completed'
    progress.completed_at = new Date().toISOString()
    progress.current_lead_name = undefined
    progress.current_phase = undefined
    await supabase.from('campaigns').update({ status: 'ready' }).eq('id', id)
  } else {
    progress.status = 'running'
  }

  await updateProgress(supabase, id, settings, progress)

  return NextResponse.json({
    ...progress,
    chunk: { processed: chunkCompleted + chunkFailed, succeeded: chunkCompleted, failed: chunkFailed },
    remaining,
  })
}

async function stopRequested(
  supabase: ReturnType<typeof createServiceClient>,
  campaignId: string,
): Promise<boolean> {
  const { data: freshCampaign } = await supabase
    .from('campaigns').select('settings').eq('id', campaignId).single()
  const freshSettings = (freshCampaign?.settings || {}) as Record<string, unknown>
  const freshProgress = freshSettings.batch_progress as BatchProgress | undefined
  return freshProgress?.status === 'idle'
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
