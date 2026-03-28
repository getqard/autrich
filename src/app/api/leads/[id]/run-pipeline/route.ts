import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runPipelineForLead } from '@/lib/pipeline/run-single-lead'

/**
 * POST /api/leads/[id]/run-pipeline
 *
 * Runs the COMPLETE pipeline on a single lead.
 * Delegates to the shared runPipelineForLead() function.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  // Determine base URL from request headers (works in Vercel + local)
  const baseUrl = request.headers.get('host')
    ? `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`
    : process.env.NEXT_PUBLIC_BASE_URL || 'https://autrich.vercel.app'

  const result = await runPipelineForLead(id, supabase, baseUrl)

  if (!result.success && result.error) {
    const status = result.error === 'Lead nicht gefunden' ? 404
      : result.error === 'Lead hat keine Website-URL' ? 400
      : 500
    return NextResponse.json(result, { status })
  }

  return NextResponse.json(result)
}
