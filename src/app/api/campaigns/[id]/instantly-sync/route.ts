import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  createCampaign,
  updateCampaign,
  getCampaign,
  InstantlyApiError,
  type SequenceStep,
  type CreateCampaignInput,
} from '@/lib/email/instantly'
import { isCompanyConfigured } from '@/lib/legal/company'

/**
 * POST /api/campaigns/[id]/instantly-sync
 *
 * Synchronisiert eine Autrich-Campaign mit Instantly.ai:
 * - Wenn `instantly_campaign_id` noch leer: legt eine neue Instantly-Campaign an,
 *   speichert die ID zurück.
 * - Wenn ID bereits da: updated die existierende Campaign (Sequence-Templates, Limits).
 *
 * Body (alles optional):
 *   { daily_limit?: number, email_accounts?: string[] }
 *
 * Sequence-Templates nutzen Custom-Variables:
 *   {{custom_subject_initial}} / {{custom_body_initial}}
 *   {{custom_subject_followup1}} / {{custom_body_followup1}}  (Block 7)
 *   {{custom_subject_followup2}} / {{custom_body_followup2}}  (Block 7)
 *
 * Send-Endpoint (separat) lädt Leads mit diesen Variables hoch.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Pre-Check 1: Erfolgssinn-LLC-Daten müssen gesetzt sein, sonst werden Footer
  // mit Platzhaltern ("[Firmenname – zu setzen]") versendet.
  const company = isCompanyConfigured()
  if (!company.ok) {
    return NextResponse.json(
      {
        error: 'Versand blockiert: COMPANY-ENV-Vars unvollständig',
        missing: company.missing,
        hint: 'Setze die Werte in .env.local und Vercel → Environment Variables, dann Server-Restart.',
      },
      { status: 400 },
    )
  }

  // Pre-Check 2: API-Key muss da sein
  if (!process.env.INSTANTLY_API_KEY) {
    return NextResponse.json({ error: 'INSTANTLY_API_KEY nicht gesetzt' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const body = (await request.json().catch(() => ({}))) as {
    daily_limit?: number
    email_accounts?: string[]
  }

  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('id, name, instantly_campaign_id')
    .eq('id', id)
    .single()

  if (campErr || !campaign) {
    return NextResponse.json({ error: 'Kampagne nicht gefunden' }, { status: 404 })
  }

  // Sequence-Template: Initial + 2 Follow-up-Slots.
  // Da Block 7 die Follow-up-Texte erst später generiert, bleiben die Variables
  // initial leer — die Sequence-Steps verschicken trotzdem nichts, weil Variables
  // pro Lead beim Send via /leads-Upload gesetzt werden. Wenn ein Lead keine
  // Follow-up-Texte hat, schickt Instantly die jeweilige Stufe nicht.
  const sequence: SequenceStep[] = [
    {
      delay: 0,
      variants: [
        {
          subject: '{{custom_subject_initial}}',
          body: '{{custom_body_initial}}',
        },
      ],
    },
    {
      delay: 3,
      variants: [
        {
          subject: '{{custom_subject_followup1}}',
          body: '{{custom_body_followup1}}',
        },
      ],
    },
    {
      delay: 7,
      variants: [
        {
          subject: '{{custom_subject_followup2}}',
          body: '{{custom_body_followup2}}',
        },
      ],
    },
  ]

  const payload: CreateCampaignInput = {
    name: `Autrich · ${campaign.name}`,
    daily_limit: body.daily_limit ?? 30,
    email_accounts: body.email_accounts,
    sequence,
    stop_on_reply: true,
    stop_on_auto_reply: true,
  }

  try {
    if (campaign.instantly_campaign_id) {
      // Existing — update
      const updated = await updateCampaign(campaign.instantly_campaign_id, payload)
      return NextResponse.json({
        action: 'updated',
        instantly_campaign_id: campaign.instantly_campaign_id,
        instantly: updated,
      })
    }

    // Create new
    const created = await createCampaign(payload)
    if (!created.id) {
      return NextResponse.json({ error: 'Instantly returned no campaign id', instantly: created }, { status: 500 })
    }

    await supabase
      .from('campaigns')
      .update({ instantly_campaign_id: created.id })
      .eq('id', id)

    return NextResponse.json({
      action: 'created',
      instantly_campaign_id: created.id,
      instantly: created,
    })
  } catch (err) {
    if (err instanceof InstantlyApiError) {
      return NextResponse.json(
        { error: err.message, status: err.status, body: err.body },
        { status: 502 },
      )
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync fehlgeschlagen' }, { status: 500 })
  }
}

/**
 * GET /api/campaigns/[id]/instantly-sync
 * Liefert Status der Instantly-Campaign (falls verknüpft).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('instantly_campaign_id')
    .eq('id', id)
    .single()

  if (!campaign?.instantly_campaign_id) {
    return NextResponse.json({ linked: false })
  }

  try {
    const instantly = await getCampaign(campaign.instantly_campaign_id)
    return NextResponse.json({ linked: true, instantly_campaign_id: campaign.instantly_campaign_id, instantly })
  } catch (err) {
    return NextResponse.json(
      {
        linked: true,
        instantly_campaign_id: campaign.instantly_campaign_id,
        error: err instanceof Error ? err.message : 'Status-Abruf fehlgeschlagen',
      },
      { status: 502 },
    )
  }
}
