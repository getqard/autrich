import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildHtmlEmail } from '@/lib/email/footer'

/**
 * GET /api/email-preview?lead_id=<uuid>&variant=<strategy>
 *
 * Rendert die komplette Email für einen Lead inkl. Footer als HTML.
 * Ersetzt {{unsubscribe_link}} mit einer Demo-URL für die Preview.
 *
 * Zweck: visuelle Abnahme des Footer-Layouts vor Block 6 (Instantly-Integration).
 *
 * Query:
 *   - lead_id:  (erforderlich) Lead-ID
 *   - variant:  (optional) Email-Strategy-Variante; Default: lead.email_strategy
 *   - mockup=1: (optional) bindet das Mockup-PNG in die Preview mit ein
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const leadId = url.searchParams.get('lead_id')
  const variant = url.searchParams.get('variant')
  const showMockup = url.searchParams.get('mockup') === '1'

  if (!leadId) {
    return NextResponse.json({ error: 'lead_id query-param fehlt' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, business_name, email_subject, email_body, email_strategy, email_variants, mockup_png_url')
    .eq('id', leadId)
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 })
  }

  // Variante auswählen
  let subject = lead.email_subject || ''
  let body = lead.email_body || ''

  const variants = (lead.email_variants || {}) as Record<string, { subject: string; body: string }>
  const chosenStrategy = variant || lead.email_strategy || 'curiosity'
  if (variants[chosenStrategy]) {
    subject = variants[chosenStrategy].subject
    body = variants[chosenStrategy].body
  }

  if (!subject || !body) {
    return NextResponse.json({ error: `Keine Email-Variante "${chosenStrategy}" für diesen Lead` }, { status: 404 })
  }

  const html = buildHtmlEmail({
    bodyPlainText: body,
    subject,
    mockupImgUrl: showMockup ? lead.mockup_png_url : null,
  })

  // Demo-Unsubscribe-Link für Preview
  const withDemoUnsubscribe = html.replace(
    /\{\{unsubscribe_link\}\}/g,
    'https://deine-treuekarte.de/unsubscribe-demo'
  )

  return new Response(withDemoUnsubscribe, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
