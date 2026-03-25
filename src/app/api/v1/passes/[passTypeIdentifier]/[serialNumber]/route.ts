import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Apple Wallet Pass Update Check
 * GET: Return latest .pkpass when Apple requests an update
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ passTypeIdentifier: string; serialNumber: string }> }
) {
  const { serialNumber } = await params
  const authHeader = request.headers.get('Authorization')
  const authToken = authHeader?.replace('ApplePass ', '') || ''

  try {
    const supabase = createServiceClient()

    const { data: lead } = await supabase
      .from('leads')
      .select('pass_auth_token')
      .eq('pass_serial', serialNumber)
      .single()

    if (!lead || lead.pass_auth_token !== authToken) {
      return new NextResponse(null, { status: 401 })
    }

    // Fetch .pkpass from storage
    const { data, error } = await supabase.storage
      .from('passes')
      .download(`${serialNumber}.pkpass`)

    if (error || !data) {
      return new NextResponse(null, { status: 404 })
    }

    const buffer = Buffer.from(await data.arrayBuffer())

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Last-Modified': new Date().toUTCString(),
      },
    })
  } catch {
    return new NextResponse(null, { status: 500 })
  }
}
