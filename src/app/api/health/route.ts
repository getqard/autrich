import { NextResponse } from 'next/server'

export async function GET() {
  const checks: Record<string, string> = {}

  // Supabase
  checks.supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing'

  // Anthropic
  checks.anthropic = process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing'

  // Instantly
  checks.instantly = process.env.INSTANTLY_API_KEY ? 'configured' : 'missing'

  // Apple Wallet
  checks.apple_wallet = process.env.APPLE_PASS_TYPE_ID ? 'configured' : 'not yet (Phase 5)'

  // Google Wallet
  checks.google_wallet = process.env.GOOGLE_ISSUER_ID ? 'configured' : 'not yet (Phase 5)'

  // Trigger.dev
  checks.trigger_dev = process.env.TRIGGER_SECRET_KEY ? 'configured' : 'missing'

  const allConfigured = Object.values(checks).every(
    (v) => v === 'configured' || v.startsWith('not yet')
  )

  return NextResponse.json({
    status: allConfigured ? 'ready' : 'setup_needed',
    checks,
    timestamp: new Date().toISOString(),
  })
}
