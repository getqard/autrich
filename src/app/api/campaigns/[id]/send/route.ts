import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { addLeadsToCampaign, InstantlyApiError } from '@/lib/email/instantly'
import { appendTextFooter } from '@/lib/email/footer'
import { isCompanyConfigured } from '@/lib/legal/company'
import { COMPANY } from '@/lib/legal/company'
import type { Lead } from '@/lib/supabase/types'

export const maxDuration = 300

const CHUNK_SIZE = 100

/**
 * POST /api/campaigns/[id]/send
 *
 * Lädt alle approved Leads (`email_status='queued'`) der Campaign zu Instantly hoch.
 * Pro Aufruf bis zu 1000 Leads, in Chunks von 100, mit gemeinsamer Stop-Polling-Logik.
 *
 * Pre-Checks:
 *  - Erfolgssinn-LLC-Daten gesetzt (kein Platzhalter-Footer)
 *  - INSTANTLY_API_KEY gesetzt
 *  - Campaign hat instantly_campaign_id (sonst → /instantly-sync zuerst)
 *
 * Pro Lead werden Custom-Variables gesetzt, damit Instantly die Sequence-Templates
 * rendern kann: {{custom_subject_initial}}, {{custom_body_initial}}, plus Follow-ups.
 * Body enthält bereits den Email-Footer (impressum/datenschutz/{{unsubscribe_link}}).
 *
 * Nach Upload: lead.email_status = 'sending', last_email_sent_at = now.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Pre-Checks
  const company = isCompanyConfigured()
  if (!company.ok) {
    return NextResponse.json(
      { error: 'Versand blockiert: COMPANY-ENV-Vars unvollständig', missing: company.missing },
      { status: 400 },
    )
  }
  if (!process.env.INSTANTLY_API_KEY) {
    return NextResponse.json({ error: 'INSTANTLY_API_KEY nicht gesetzt' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name, instantly_campaign_id, is_paused')
    .eq('id', id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Kampagne nicht gefunden' }, { status: 404 })
  if (!campaign.instantly_campaign_id) {
    return NextResponse.json(
      { error: 'Campaign noch nicht mit Instantly verknüpft. POST /instantly-sync zuerst.' },
      { status: 400 },
    )
  }
  if (campaign.is_paused) {
    return NextResponse.json({ error: 'Kampagne ist pausiert' }, { status: 400 })
  }

  // Body-Optionen
  const body = (await request.json().catch(() => ({}))) as { dry_run?: boolean; max?: number }
  const max = Math.min(body.max ?? 1000, 5000)

  // Approved leads ziehen
  const { data: leadsRaw, error: leadsErr } = await supabase
    .from('leads')
    .select('*')
    .eq('campaign_id', id)
    .eq('email_status', 'queued')
    .not('email', 'is', null)
    .order('lead_score', { ascending: false })
    .limit(max)

  if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 })

  const leads = (leadsRaw || []) as Lead[]

  if (leads.length === 0) {
    return NextResponse.json({
      sent: 0,
      message: 'Keine versand-bereiten Leads (email_status=queued) gefunden.',
    })
  }

  if (body.dry_run) {
    return NextResponse.json({
      dry_run: true,
      would_send: leads.length,
      first_3: leads.slice(0, 3).map((l) => ({
        email: l.email,
        business_name: l.business_name,
        subject: l.email_subject,
      })),
    })
  }

  let uploaded = 0
  let duplicates = 0
  const errors: string[] = []
  const sentIds: string[] = []

  for (let i = 0; i < leads.length; i += CHUNK_SIZE) {
    const chunk = leads.slice(i, i + CHUNK_SIZE)
    const payload = chunk
      .filter((l) => l.email && l.email_subject && l.email_body)
      .map((lead) => {
        const nameParts = (lead.contact_name || '').trim().split(/\s+/).filter(Boolean)
        const firstName = nameParts[0] || undefined
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined
        return {
          email: lead.email!,
          first_name: firstName,
          last_name: lastName,
          company_name: lead.business_name,
          custom_variables: buildCustomVars(lead),
        }
      })

    if (payload.length === 0) continue

    try {
      const res = await addLeadsToCampaign({
        campaign_id: campaign.instantly_campaign_id,
        leads: payload,
      })
      uploaded += res.uploaded ?? payload.length
      duplicates += res.duplicates ?? 0
      sentIds.push(...chunk.map((l) => l.id))
    } catch (err) {
      const msg = err instanceof InstantlyApiError ? err.message : err instanceof Error ? err.message : 'unknown'
      errors.push(`Chunk ${i / CHUNK_SIZE + 1}: ${msg}`)
    }
  }

  // Status-Update für erfolgreich hochgeladene Leads
  if (sentIds.length > 0) {
    const now = new Date().toISOString()
    await supabase
      .from('leads')
      .update({
        email_status: 'sending',
        last_email_sent_at: now,
        instantly_campaign_id: campaign.instantly_campaign_id,
      })
      .in('id', sentIds)

    // Wenn Campaign noch nie aktiv war: sending_started_at setzen
    await supabase
      .from('campaigns')
      .update({ sending_started_at: now })
      .eq('id', id)
      .is('sending_started_at', null)
  }

  return NextResponse.json({
    uploaded,
    duplicates,
    errors,
    total_eligible: leads.length,
    instantly_campaign_id: campaign.instantly_campaign_id,
  })
}

// ─── Helpers ─────────────────────────────────────────────────────

function buildCustomVars(lead: Lead): Record<string, string | number | null> {
  const downloadUrl = lead.download_page_slug
    ? `${COMPANY.publicUrl}/d/${lead.download_page_slug}`
    : null

  // Initial: AI-generierter Subject + Body, Footer dran
  const initialSubject = lead.email_subject || ''
  const initialBody = appendTextFooter(lead.email_body || '')

  return {
    business_name: lead.business_name,
    download_url: downloadUrl,
    mockup_url: lead.mockup_png_url,
    industry: lead.industry,
    city: lead.city,

    // Sequence variables für Initial
    custom_subject_initial: initialSubject,
    custom_body_initial: initialBody,

    // Follow-ups (kommen aus Block 7 — bis dahin leer)
    custom_subject_followup1: lead.email_followup1_subject || '',
    custom_body_followup1: lead.email_followup1_body
      ? appendTextFooter(lead.email_followup1_body)
      : '',
    custom_subject_followup2: lead.email_followup2_subject || '',
    custom_body_followup2: lead.email_followup2_body
      ? appendTextFooter(lead.email_followup2_body)
      : '',
  }
}
