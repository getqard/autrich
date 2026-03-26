import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/tracking
 * Log tracking events (page visits, downloads, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const { event_type, lead_id, metadata } = await request.json()

    if (!event_type || !lead_id) {
      return NextResponse.json({ error: 'event_type and lead_id required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    await supabase.from('tracking_events').insert({
      lead_id,
      event_type,
      metadata: metadata || {},
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Tracking failed' }, { status: 500 })
  }
}
