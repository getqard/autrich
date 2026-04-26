import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/inbox/[leadId]/seen
 * Markiert eine Reply als gelesen (setzt reply_seen_at = now).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('leads')
    .update({ reply_seen_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
