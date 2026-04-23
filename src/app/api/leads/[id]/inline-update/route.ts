import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * PATCH /api/leads/[id]/inline-update
 *
 * Debounced Inline-Saves aus Stage 2 (Enrichment-Review).
 * Whitelisted Felder: logo_url, dominant_color, text_color, label_color,
 * detected_reward, detected_reward_emoji, detected_industry, detected_pass_title,
 * detected_stamp_emoji, detected_max_stamps, contact_name, email,
 * email_hooks, personalization_notes, address, city.
 */
const ALLOWED_FIELDS = new Set([
  'logo_url',
  'dominant_color',
  'text_color',
  'label_color',
  'detected_reward',
  'detected_reward_emoji',
  'detected_industry',
  'detected_pass_title',
  'detected_stamp_emoji',
  'detected_max_stamps',
  'contact_name',
  'email',
  'email_hooks',
  'personalization_notes',
  'address',
  'city',
  // Stage 3 — Final-Review Inline-Edits
  'email_subject',
  'email_body',
  'email_variants',
])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const body = await request.json() as Record<string, unknown>

  const updateData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(key)) {
      updateData[key] = value
    }
  }

  // accent_color spiegelt label_color
  if (typeof updateData.label_color === 'string') {
    updateData.accent_color = updateData.label_color
  }

  // Mockup-Cache invalidieren wenn visuelle Felder geändert wurden (Block 4)
  const MOCKUP_INVALIDATING_FIELDS = [
    'logo_url',
    'dominant_color',
    'text_color',
    'label_color',
    'detected_reward',
    'detected_reward_emoji',
    'detected_stamp_emoji',
    'detected_max_stamps',
    'detected_pass_title',
  ]
  if (MOCKUP_INVALIDATING_FIELDS.some(f => f in updateData)) {
    updateData.mockup_png_url = null
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Kein gültiges Feld zum Updaten' }, { status: 400 })
  }

  const { error } = await supabase.from('leads').update(updateData).eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, updated: Object.keys(updateData) })
}
