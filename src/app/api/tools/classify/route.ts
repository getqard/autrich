import { NextRequest, NextResponse } from 'next/server'
import { classifyBusiness } from '@/lib/ai/classifier'
import type { ClassifyInput } from '@/lib/enrichment/types'

export async function POST(request: NextRequest) {
  try {
    const body: ClassifyInput = await request.json()

    if (!body.business_name || typeof body.business_name !== 'string') {
      return NextResponse.json({ error: 'business_name ist erforderlich' }, { status: 400 })
    }

    const result = await classifyBusiness(body)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Klassifizierung fehlgeschlagen' },
      { status: 500 }
    )
  }
}
