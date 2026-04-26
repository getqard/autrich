import { NextResponse } from 'next/server'
import { isCompanyConfigured } from '@/lib/legal/company'

export async function GET() {
  const checks: Record<string, string> = {}

  checks.supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing'
  checks.anthropic = process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing'
  checks.gemini = process.env.GEMINI_API_KEY ? 'configured' : 'missing'
  checks.instantly = process.env.INSTANTLY_API_KEY ? 'configured' : 'missing'
  checks.instantly_webhook_secret = process.env.INSTANTLY_WEBHOOK_SECRET ? 'configured' : 'missing'
  checks.gmaps_scraper = process.env.GMAPS_API_URL ? 'configured' : 'missing'
  checks.apple_wallet = process.env.APPLE_PASS_TYPE_ID ? 'configured' : 'missing'
  checks.google_wallet = process.env.GOOGLE_ISSUER_ID ? 'configured' : 'missing'
  checks.screenshot = process.env.SCREENSHOTONE_ACCESS_KEY ? 'configured' : 'missing'
  checks.company_legal = isCompanyConfigured() ? 'configured' : 'missing'
  checks.download_base_url = process.env.NEXT_PUBLIC_DOWNLOAD_BASE_URL ? 'configured' : 'missing'

  const allConfigured = Object.values(checks).every((v) => v === 'configured')

  return NextResponse.json({
    status: allConfigured ? 'ready' : 'setup_needed',
    checks,
    timestamp: new Date().toISOString(),
  })
}
