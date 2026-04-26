import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyWebhookSignature } from '@/lib/email/instantly'
import { addLeadEmailToBlacklist } from '@/lib/leads/blacklist'

export const maxDuration = 30

/**
 * POST /api/webhooks/instantly
 *
 * Empfängt Events von Instantly (in der Instantly-UI als Webhook-URL gesetzt).
 *
 * Erwartete Events (laut Instantly v2):
 *   email_sent       → lead.email_status = 'sent', email_sent_at
 *   email_opened     → email_status = 'opened', email_opened_at
 *   email_clicked    → email_status = 'clicked', email_clicked_at
 *   reply_received   → email_status = 'replied', email_replied_at + Blacklist
 *   email_bounced    → email_status = 'bounced' + Blacklist
 *   lead_unsubscribed → email_status = 'unsubscribed' + Blacklist
 *
 * Idempotenz über `instantly_event_id` (UNIQUE-Index in email_events).
 * Signatur-Check via INSTANTLY_WEBHOOK_SECRET (HMAC-SHA256).
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signatureHeader =
    request.headers.get('x-instantly-signature') ||
    request.headers.get('x-webhook-signature') ||
    request.headers.get('signature')

  // Signatur prüfen, wenn Secret gesetzt ist (im Dev / Initial-Setup ggf. skip)
  if (process.env.INSTANTLY_WEBHOOK_SECRET) {
    const valid = await verifyWebhookSignature(rawBody, signatureHeader)
    if (!valid) {
      console.warn('[instantly-webhook] Invalid signature', { sig: signatureHeader?.slice(0, 20) })
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let payload: WebhookPayload
  try {
    payload = JSON.parse(rawBody) as WebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = normalizeEventType(payload.event_type || payload.event || payload.type)
  const eventId = payload.event_id || payload.id
  const leadEmail = (payload.lead_email || payload.email || '').toLowerCase()
  const instantlyCampaignId = payload.campaign_id || payload.campaign

  if (!eventType) {
    return NextResponse.json({ error: 'Missing event_type' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Lead über email + instantly_campaign_id finden
  let lead: { id: string; campaign_id: string | null; email: string | null } | null = null
  if (leadEmail) {
    const query = supabase
      .from('leads')
      .select('id, campaign_id, email')
      .ilike('email', leadEmail)
      .limit(1)
    if (instantlyCampaignId) query.eq('instantly_campaign_id', instantlyCampaignId)
    const { data } = await query.maybeSingle()
    lead = data || null
  }

  if (!lead) {
    console.warn('[instantly-webhook] Lead not found for event', { eventType, leadEmail, instantlyCampaignId })
    // Trotzdem 200 zurückgeben, damit Instantly nicht ewig retried
    return NextResponse.json({ ok: true, ignored: 'lead_not_found' })
  }

  // Event in email_events persistieren (idempotent über instantly_event_id)
  const { error: insertErr } = await supabase.from('email_events').insert({
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    event_type: eventType,
    instantly_event_id: eventId || null,
    metadata: payload as unknown as Record<string, unknown>,
    occurred_at: payload.occurred_at || payload.timestamp || new Date().toISOString(),
  })

  // Duplikat (UNIQUE-Verstoß) → ack, aber nicht nochmal Status updaten
  if (insertErr && (insertErr.code === '23505' || /duplicate/i.test(insertErr.message))) {
    return NextResponse.json({ ok: true, deduped: true })
  }
  if (insertErr) {
    console.error('[instantly-webhook] insert email_event failed', insertErr)
  }

  // Lead-Status updaten
  const update = mapEventToLeadUpdate(eventType, payload)
  if (update) {
    await supabase.from('leads').update(update).eq('id', lead.id)

    // Bei terminalen Events Email auf Blacklist
    if (eventType === 'replied' || eventType === 'bounced' || eventType === 'unsubscribed') {
      await addLeadEmailToBlacklist(supabase, lead.id, `instantly_${eventType}`)
    }
  }

  return NextResponse.json({ ok: true, eventType, leadId: lead.id })
}

// ─── Type Helpers ────────────────────────────────────────────────

type WebhookPayload = {
  event_type?: string
  event?: string
  type?: string
  event_id?: string
  id?: string
  lead_email?: string
  email?: string
  campaign_id?: string
  campaign?: string
  occurred_at?: string
  timestamp?: string
  [key: string]: unknown
}

function normalizeEventType(raw: string | undefined): string | null {
  if (!raw) return null
  const map: Record<string, string> = {
    email_sent: 'sent',
    email_opened: 'opened',
    email_clicked: 'clicked',
    reply_received: 'replied',
    email_replied: 'replied',
    email_bounced: 'bounced',
    bounce: 'bounced',
    lead_unsubscribed: 'unsubscribed',
    unsubscribe: 'unsubscribed',
  }
  return map[raw] || raw
}

function mapEventToLeadUpdate(eventType: string, payload?: WebhookPayload): Record<string, unknown> | null {
  const now = new Date().toISOString()
  switch (eventType) {
    case 'sent':
      return { email_status: 'sent', email_sent_at: now }
    case 'opened':
      return { email_status: 'opened', email_opened_at: now }
    case 'clicked':
      return { email_status: 'clicked', email_clicked_at: now }
    case 'replied': {
      const replyText =
        (payload?.reply_text as string | undefined) ||
        (payload?.body as string | undefined) ||
        (payload?.text as string | undefined) ||
        null
      return {
        email_status: 'replied',
        email_replied_at: now,
        pipeline_status: 'engaged',
        reply_text: replyText,
      }
    }
    case 'bounced':
      return { email_status: 'bounced' }
    case 'unsubscribed':
      return { email_status: 'unsubscribed', pipeline_status: 'lost' }
    default:
      return null
  }
}
