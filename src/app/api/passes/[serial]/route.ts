import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/passes/[serial]
 *
 * Public .pkpass download endpoint.
 * Fetches the signed .pkpass file from Supabase Storage and serves it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ serial: string }> }
) {
  const { serial } = await params

  if (!serial) {
    return NextResponse.json({ error: 'Serial number required' }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()

    // Fetch .pkpass from storage
    const storagePath = `${serial}.pkpass`
    const { data, error } = await supabase.storage
      .from('passes')
      .download(storagePath)

    if (error || !data) {
      return NextResponse.json({ error: 'Pass not found' }, { status: 404 })
    }

    const buffer = Buffer.from(await data.arrayBuffer())

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${serial}.pkpass"`,
        'Last-Modified': new Date().toUTCString(),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Download failed' },
      { status: 500 }
    )
  }
}
