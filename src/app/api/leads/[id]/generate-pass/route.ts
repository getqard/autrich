import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generatePassesForLead } from '@/lib/wallet/pass-data'
import type { Lead } from '@/lib/supabase/types'

/**
 * POST /api/leads/[id]/generate-pass
 *
 * Generate Apple + Google passes for a specific lead.
 * Updates the lead in DB with pass URLs and status.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const startTime = Date.now()

  try {
    const supabase = createServiceClient()

    // Fetch lead
    const { data: lead, error: fetchErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !lead) {
      return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 })
    }

    // Validate required enrichment data
    if (!lead.dominant_color) {
      return NextResponse.json({ error: 'Lead hat keine Farben — bitte zuerst enrichen' }, { status: 400 })
    }

    // Generate passes
    const result = await generatePassesForLead(lead as Lead)

    // Update lead in DB
    const { error: updateErr } = await supabase
      .from('leads')
      .update({
        pass_status: 'ready',
        pass_serial: result.passSerial,
        pass_auth_token: result.passAuthToken,
        apple_pass_url: result.applePassUrl,
        google_pass_url: result.googleSaveUrl,
        strip_image_url: result.stripPublicUrl || lead.strip_image_url,
      })
      .eq('id', id)

    if (updateErr) {
      console.error('[Generate Pass] DB update failed:', updateErr)
    }

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - startTime,
      passSerial: result.passSerial,
      apple: {
        downloadUrl: `/api/passes/${result.passSerial}`,
        storageUrl: result.applePassUrl,
        sizeBytes: result.applePassBuffer.length,
      },
      google: {
        saveUrl: result.googleSaveUrl,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Pass-Generierung fehlgeschlagen' },
      { status: 500 }
    )
  }
}
