import { NextRequest, NextResponse } from 'next/server'

/**
 * Apple Wallet Error Log
 * POST: Apple devices report pass-related errors here
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('[Apple Log]', JSON.stringify(body))
  } catch { /* ignore */ }

  return new NextResponse(null, { status: 200 })
}
