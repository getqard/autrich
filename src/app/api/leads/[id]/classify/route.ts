import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { classifyBusiness } from '@/lib/ai/classifier'
import { calculateLeadScore } from '@/lib/enrichment/score'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  // Load lead
  const { data: lead, error: loadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (loadError || !lead) {
    return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 })
  }

  try {
    const classification = await classifyBusiness({
      business_name: lead.business_name,
      industry: lead.industry,
      city: lead.city,
      website_description: lead.website_description,
      gmaps_category: lead.gmaps_category,
      categories: lead.structured_data?.servesCuisine
        ? [String(lead.structured_data.servesCuisine)]
        : undefined,
      has_existing_loyalty: lead.has_existing_loyalty,
      has_app: lead.has_app,
      google_rating: lead.google_rating,
      google_reviews_count: lead.google_reviews_count,
      social_links: lead.social_links,
    })

    const updateData = {
      detected_industry: classification.detected_industry,
      detected_reward: classification.detected_reward,
      detected_reward_emoji: classification.detected_reward_emoji,
      detected_stamp_emoji: classification.detected_stamp_emoji,
      detected_pass_title: classification.detected_pass_title,
      detected_max_stamps: classification.detected_max_stamps,
      strip_prompt: classification.strip_prompt,
      email_hooks: classification.email_hooks,
      personalization_notes: classification.personalization_notes,
    }

    // Recalculate score
    const updatedLead = { ...lead, ...updateData }
    const lead_score = calculateLeadScore(updatedLead)

    const { data: result, error: updateError } = await supabase
      .from('leads')
      .update({ ...updateData, lead_score })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      throw new Error(updateError.message)
    }

    return NextResponse.json({
      ...result,
      _classification: {
        tokens_in: classification.tokens_in,
        tokens_out: classification.tokens_out,
        cost_usd: classification.cost_usd,
        duration_ms: classification.duration_ms,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Klassifizierung fehlgeschlagen' },
      { status: 500 }
    )
  }
}
