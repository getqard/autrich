import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/leads/[id] — Lead detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 })
  }

  // Get tracking events
  const { data: events } = await supabase
    .from('tracking_events')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ ...lead, events: events || [] })
}

// PATCH /api/leads/[id] — Update lead
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const supabase = createServiceClient()

  // Only allow certain fields to be updated manually
  const allowedFields = ['pipeline_status', 'contact_status', 'notes', 'reply_category', 'lead_score']
  const updateData: Record<string, unknown> = {}

  for (const field of allowedFields) {
    if (field in body) {
      updateData[field] = body[field]
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Keine aktualisierbaren Felder' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('leads')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE /api/leads/[id] — Delete lead + optional blacklist
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const blacklist = searchParams.get('blacklist') === 'true'

  const supabase = createServiceClient()

  if (blacklist) {
    // Get email first
    const { data: lead } = await supabase
      .from('leads')
      .select('email')
      .eq('id', id)
      .single()

    if (lead?.email) {
      await supabase
        .from('blacklist')
        .upsert({ email: lead.email, reason: 'manual' }, { onConflict: 'email' })
    }
  }

  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
