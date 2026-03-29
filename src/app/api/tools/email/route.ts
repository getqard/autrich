import { NextRequest, NextResponse } from 'next/server'
import { writeEmail, type EmailStrategy } from '@/lib/email/writer'

const VALID_STRATEGIES: EmailStrategy[] = ['curiosity', 'social_proof', 'direct', 'storytelling', 'provocation']

/**
 * POST /api/tools/email
 *
 * Generate a cold email for a business.
 * Body: all EmailInput fields + action
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { action = 'generate' } = body

    if (action === 'generate') {
      const {
        business_name,
        contact_name,
        contact_first_name,
        contact_last_name,
        industry,
        city,
        website_description,
        website_about,
        website_headlines,
        founding_year,
        google_rating,
        google_reviews_count,
        has_existing_loyalty,
        has_app,
        email_hooks,
        personalization_notes,
        detected_reward,
        download_url,
        strategy = 'curiosity',
        formal = false,
      } = body

      if (!business_name) {
        return NextResponse.json({ error: 'business_name erforderlich' }, { status: 400 })
      }
      if (!VALID_STRATEGIES.includes(strategy)) {
        return NextResponse.json({ error: `strategy muss ${VALID_STRATEGIES.join(', ')} sein` }, { status: 400 })
      }

      const result = await writeEmail({
        business_name,
        contact_name,
        contact_first_name,
        contact_last_name,
        industry,
        city,
        website_description,
        website_about,
        website_headlines,
        founding_year: founding_year ? parseInt(founding_year) : null,
        google_rating: google_rating ? parseFloat(google_rating) : null,
        google_reviews_count: google_reviews_count ? parseInt(google_reviews_count) : null,
        has_existing_loyalty: !!has_existing_loyalty,
        has_app: !!has_app,
        email_hooks: email_hooks || [],
        personalization_notes,
        detected_reward,
        download_url: download_url || 'https://deine-treuekarte.de/d/demo',
        strategy,
        formal,
      })

      return NextResponse.json({
        ...result,
        durationMs: Date.now() - startTime,
      })
    }

    if (action === 'generate-all') {
      // Generate all 5 strategies at once
      const results: Record<string, unknown>[] = []
      for (const strategy of VALID_STRATEGIES) {
        try {
          const result = await writeEmail({ ...body, strategy })
          results.push({ ...result })
        } catch (err) {
          results.push({ strategy, error: err instanceof Error ? err.message : 'Failed' })
        }
      }
      return NextResponse.json({ results, durationMs: Date.now() - startTime })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Email-Generierung fehlgeschlagen' },
      { status: 500 }
    )
  }
}
