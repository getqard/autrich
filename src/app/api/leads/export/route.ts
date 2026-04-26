import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { Lead } from '@/lib/supabase/types'
import { leadsToCsv, leadsToXlsx, buildExportFilename } from '@/lib/utils/csv-export'

/**
 * GET /api/leads/export
 *
 * Exportiert Leads als CSV oder XLSX. Symmetrisch zum CSV-Import:
 * was hier rauskommt, kann in eine andere Campaign re-importiert werden.
 *
 * Query-Params (alle optional):
 *   campaign_id         — nur Leads dieser Campaign
 *   pipeline_status     — z.B. "interested" oder "blacklisted"
 *   triage_status       — z.B. "approved"
 *   enrichment_status   — z.B. "completed"
 *   email_status        — z.B. "sent"
 *   min_score           — nur Leads mit lead_score >= N
 *   search              — Volltext-Suche auf business_name / email / city
 *   format              — "csv" (default) oder "xlsx"
 *
 * Beispiel: /api/leads/export?campaign_id=...&triage_status=approved&format=xlsx
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const params = url.searchParams

  const campaignId = params.get('campaign_id')
  const pipelineStatus = params.get('pipeline_status')
  const triageStatus = params.get('triage_status')
  const enrichmentStatus = params.get('enrichment_status')
  const emailStatus = params.get('email_status')
  const minScore = params.get('min_score')
  const search = params.get('search')
  const format = (params.get('format') || 'csv').toLowerCase()

  if (format !== 'csv' && format !== 'xlsx') {
    return NextResponse.json({ error: 'format muss "csv" oder "xlsx" sein' }, { status: 400 })
  }

  const supabase = createServiceClient()
  let query = supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(10000)

  if (campaignId) query = query.eq('campaign_id', campaignId)
  if (pipelineStatus) query = query.eq('pipeline_status', pipelineStatus)
  if (triageStatus) query = query.eq('triage_status', triageStatus)
  if (enrichmentStatus) query = query.eq('enrichment_status', enrichmentStatus)
  if (emailStatus) query = query.eq('email_status', emailStatus)
  if (minScore) {
    const n = parseInt(minScore, 10)
    if (!isNaN(n)) query = query.gte('lead_score', n)
  }
  if (search) {
    const safe = search.replace(/[%]/g, '')
    query = query.or(`business_name.ilike.%${safe}%,email.ilike.%${safe}%,city.ilike.%${safe}%`)
  }

  const { data: leads, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = (leads || []) as Lead[]

  // Filename-Scope: Campaign-Name falls vorhanden, sonst Filter-Hinweis
  let scope: string | null = null
  if (campaignId) {
    const { data: campaign } = await supabase.from('campaigns').select('name').eq('id', campaignId).single()
    scope = campaign?.name || null
  } else if (triageStatus) {
    scope = `triage-${triageStatus}`
  } else if (pipelineStatus) {
    scope = pipelineStatus
  }

  const filename = buildExportFilename(scope, format as 'csv' | 'xlsx')

  if (format === 'xlsx') {
    const arrayBuffer = leadsToXlsx(list)
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(arrayBuffer.byteLength),
      },
    })
  }

  const csv = leadsToCsv(list)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
