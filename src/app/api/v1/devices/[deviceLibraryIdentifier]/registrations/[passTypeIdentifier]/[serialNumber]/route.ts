import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Apple Wallet Device Registration — Install/Uninstall Detection
 *
 * POST: Device registers for pass updates (= pass installed)
 * DELETE: Device unregisters (= pass removed)
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string; serialNumber: string }> }
) {
  const { serialNumber } = await params
  const authHeader = request.headers.get('Authorization')
  const authToken = authHeader?.replace('ApplePass ', '') || ''

  try {
    const supabase = createServiceClient()

    // Verify auth token matches the pass
    const { data: lead } = await supabase
      .from('leads')
      .select('id, pass_auth_token')
      .eq('pass_serial', serialNumber)
      .single()

    if (!lead || lead.pass_auth_token !== authToken) {
      return new NextResponse(null, { status: 401 })
    }

    // Mark pass as installed
    await supabase
      .from('leads')
      .update({
        pass_installed: true,
        pass_installed_at: new Date().toISOString(),
        pass_installed_platform: 'apple',
      })
      .eq('id', lead.id)

    console.log(`[Apple Callback] Pass installed: ${serialNumber}`)
    return new NextResponse(null, { status: 201 })
  } catch (err) {
    console.error('[Apple Callback] Registration error:', err)
    return new NextResponse(null, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string; serialNumber: string }> }
) {
  const { serialNumber } = await params
  const authHeader = request.headers.get('Authorization')
  const authToken = authHeader?.replace('ApplePass ', '') || ''

  try {
    const supabase = createServiceClient()

    const { data: lead } = await supabase
      .from('leads')
      .select('id, pass_auth_token')
      .eq('pass_serial', serialNumber)
      .single()

    if (!lead || lead.pass_auth_token !== authToken) {
      return new NextResponse(null, { status: 401 })
    }

    await supabase
      .from('leads')
      .update({ pass_installed: false })
      .eq('id', lead.id)

    console.log(`[Apple Callback] Pass removed: ${serialNumber}`)
    return new NextResponse(null, { status: 200 })
  } catch (err) {
    console.error('[Apple Callback] Unregistration error:', err)
    return new NextResponse(null, { status: 500 })
  }
}
