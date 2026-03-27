import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { writeEmail, type EmailStrategy } from '@/lib/email/writer'
import type { Lead } from '@/lib/supabase/types'

/**
 * POST /api/leads/[id]/generate-email
 *
 * Generate a cold email for a specific lead.
 * Optionally: ?all=true to generate all 5 strategies.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const supabase = createServiceClient()
    const { data: lead, error: fetchErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !lead) {
      return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 })
    }

    const typedLead = lead as Lead
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://autrich.vercel.app'
    const downloadUrl = typedLead.download_page_slug
      ? `${baseUrl}/d/${typedLead.download_page_slug}`
      : baseUrl

    // Parse extra_data for enrichment
    const extra = (typedLead.extra_data || {}) as Record<string, unknown>

    const emailInput = {
      business_name: typedLead.business_name,
      contact_name: typedLead.contact_name || null,
      contact_first_name: (extra.contact_first_name as string) || (typedLead.contact_name ? typedLead.contact_name.split(' ')[0] : null),
      contact_last_name: (extra.contact_last_name as string) || (typedLead.contact_name ? typedLead.contact_name.split(' ').slice(-1)[0] : null),
      city: typedLead.city || null,
      industry: typedLead.detected_industry || typedLead.industry || null,
      website_description: typedLead.website_description || null,
      website_about: (extra.website_about as string) || null,
      website_headlines: (extra.website_headlines as string) || null,
      founding_year: (extra.founding_year as number) || null,
      google_rating: typedLead.google_rating ? Number(typedLead.google_rating) : null,
      google_reviews_count: typedLead.google_reviews_count || null,
      has_existing_loyalty: typedLead.has_existing_loyalty || false,
      has_app: typedLead.has_app || false,
      email_hooks: (typedLead.email_hooks as string[]) || [],
      personalization_notes: typedLead.personalization_notes || null,
      detected_reward: typedLead.detected_reward || null,
      download_url: downloadUrl,
      formal: false,
    }

    // Check if all 5 strategies requested
    let body: Record<string, unknown> = {}
    try { body = await request.json() } catch { /* no body = single generate */ }
    const generateAll = body.all === true

    if (generateAll) {
      // Generate all 5 strategies
      const strategies: EmailStrategy[] = ['curiosity', 'social_proof', 'direct', 'storytelling', 'provocation']
      const results = []
      for (const strategy of strategies) {
        try {
          const result = await writeEmail({ ...emailInput, strategy })
          results.push(result)
        } catch (err) {
          results.push({ strategy, error: err instanceof Error ? err.message : 'Failed' })
        }
      }

      // Save the first (curiosity) as default
      const first = results[0]
      if (first && 'subject' in first) {
        await supabase.from('leads').update({
          email_subject: first.subject,
          email_body: first.body,
          email_strategy: first.strategy,
          email_status: 'review',
        }).eq('id', id)
      }

      return NextResponse.json({ results })
    }

    // Single strategy
    const strategy = (body.strategy as EmailStrategy) || 'curiosity'
    const result = await writeEmail({ ...emailInput, strategy })

    // Save to lead
    await supabase.from('leads').update({
      email_subject: result.subject,
      email_body: result.body,
      email_strategy: result.strategy,
      email_status: 'review',
    }).eq('id', id)

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Email-Generierung fehlgeschlagen' },
      { status: 500 }
    )
  }
}
