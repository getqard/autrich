import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { EmailStrategy } from '@/lib/supabase/types'

/**
 * POST /api/leads/[id]/review-action
 *
 * QC review actions:
 * - approve: Set email_status='queued', optionally switch strategy
 * - skip: No change, just move to next lead
 * - reject: Mark lead as rejected (pipeline_status='blacklisted')
 * - update: Patch colors/strip, optionally regenerate pass
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const body = await request.json() as {
    action: 'approve' | 'skip' | 'reject' | 'update'
    strategy?: EmailStrategy
    colors?: { dominant_color?: string; text_color?: string; label_color?: string }
    strip_image_url?: string
  }

  const { data: lead, error: fetchErr } = await supabase
    .from('leads').select('email_subject, email_body, email_strategy, email_variants, ab_group, ab_group_override').eq('id', id).single()

  if (fetchErr || !lead) {
    return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 })
  }

  switch (body.action) {
    case 'approve': {
      const variants = (lead.email_variants || {}) as Record<string, { subject: string; body: string }>
      const strategy = body.strategy || lead.email_strategy || lead.ab_group || 'curiosity'
      const chosen = variants[strategy] || { subject: lead.email_subject, body: lead.email_body }

      const updateData: Record<string, unknown> = {
        email_subject: chosen.subject,
        email_body: chosen.body,
        email_strategy: strategy,
        email_status: 'queued',
      }

      // Override-Tracking: ab_group_override = true, wenn die approved
      // Strategie nicht der ursprünglich zugewiesenen ab_group entspricht.
      // Einmal true, bleibt true (kein Re-Set auf false beim Zurückwechseln).
      if (lead.ab_group && strategy !== lead.ab_group && !lead.ab_group_override) {
        updateData.ab_group_override = true
      }

      await supabase.from('leads').update(updateData).eq('id', id)

      return NextResponse.json({
        success: true,
        action: 'approve',
        strategy,
        ab_group_override: lead.ab_group ? strategy !== lead.ab_group : false,
      })
    }

    case 'skip': {
      // No DB change — lead stays in review
      return NextResponse.json({ success: true, action: 'skip' })
    }

    case 'reject': {
      await supabase.from('leads').update({
        pipeline_status: 'blacklisted',
      }).eq('id', id)

      return NextResponse.json({ success: true, action: 'reject' })
    }

    case 'update': {
      const updateData: Record<string, unknown> = {}

      if (body.colors) {
        if (body.colors.dominant_color) updateData.dominant_color = body.colors.dominant_color
        if (body.colors.text_color) updateData.text_color = body.colors.text_color
        if (body.colors.label_color) {
          updateData.label_color = body.colors.label_color
          updateData.accent_color = body.colors.label_color // accent = label
        }
      }

      if (body.strip_image_url) {
        updateData.strip_image_url = body.strip_image_url
      }

      // Mockup-Cache invalidieren wenn Farben/Strip geändert (Block 4)
      if (Object.keys(updateData).length > 0) {
        updateData.mockup_png_url = null
      }

      if (Object.keys(updateData).length > 0) {
        const { error: updateErr } = await supabase.from('leads').update(updateData).eq('id', id)
        if (updateErr) {
          return NextResponse.json({ error: updateErr.message }, { status: 500 })
        }
      }

      return NextResponse.json({ success: true, action: 'update', updated: Object.keys(updateData) })
    }

    default:
      return NextResponse.json({ error: 'Unbekannte Action' }, { status: 400 })
  }
}
