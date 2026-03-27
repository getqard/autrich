import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { scrapeWebsite } from '@/lib/enrichment/scraper'
import { captureWebsite } from '@/lib/enrichment/screenshot'
import { determinePassColors } from '@/lib/enrichment/pass-colors'
import { checkLogoVisibility } from '@/lib/enrichment/logo-contrast-check'
import { scrapeImpressum, extractHeadlines, extractAboutPage } from '@/lib/enrichment/impressum'
import { classifyBusiness } from '@/lib/ai/classifier'
import { generatePassesForLead } from '@/lib/wallet/pass-data'
import { writeEmail, type EmailStrategy } from '@/lib/email/writer'
import type { Lead } from '@/lib/supabase/types'

/**
 * POST /api/leads/[id]/run-pipeline
 *
 * Runs the COMPLETE pipeline on a single lead:
 * 1. Scrape website (logo, colors, impressum, headlines)
 * 2. AI Classification (industry, reward, hooks)
 * 3. Generate Pass (Apple + Google + download page)
 * 4. Generate 5 Emails (all strategies)
 *
 * Returns step-by-step results via streaming-like JSON.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()
  const startTime = Date.now()

  // Load lead
  const { data: lead, error: fetchErr } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !lead) {
    return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 })
  }

  if (!lead.website_url) {
    return NextResponse.json({ error: 'Lead hat keine Website-URL' }, { status: 400 })
  }

  const steps: Record<string, unknown> = {}
  const url = lead.website_url

  try {
    // ═══ STEP 1: Scrape Website ═══════════════════════════════
    const scrapeStart = Date.now()
    const scrapeResult = await scrapeWebsite(url)
    const screenshot = await captureWebsite(url).catch(() => null)

    // Get best logo
    let logoBuffer: Buffer | null = null
    let logoSource: string | null = null
    if (scrapeResult.bestLogo?.url) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(scrapeResult.bestLogo.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        })
        clearTimeout(timeout)
        if (res.ok) {
          logoBuffer = Buffer.from(await res.arrayBuffer())
          logoSource = 'website'
        }
      } catch { /* fallback */ }
    }

    // Colors
    const passColors = await determinePassColors({
      logoBuffer,
      cssCandidates: scrapeResult.brandColors?.candidates || [],
      headerBackground: scrapeResult.brandColors?.headerBackground ?? null,
      headerScreenshot: screenshot,
      websiteContext: {
        title: scrapeResult.title,
        description: scrapeResult.description,
        themeColor: scrapeResult.themeColor,
      },
      industrySlug: lead.detected_industry || null,
      industryDefaults: null,
      gmapsPhotoBuffer: null,
    })

    // Impressum
    let contactName: string | null = lead.contact_name
    let firstName: string | null = null
    let lastName: string | null = null
    let foundingYear: number | null = null
    let websiteHeadlines = ''
    let websiteAbout: string | null = null

    try {
      const baseUrl = scrapeResult.finalUrl || url
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const htmlRes = await fetch(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      clearTimeout(timeout)
      if (htmlRes.ok) {
        const html = await htmlRes.text()
        const [impressum, about] = await Promise.all([
          scrapeImpressum(html, baseUrl),
          extractAboutPage(html, baseUrl),
        ])
        if (impressum.contactName && !contactName) {
          contactName = impressum.contactName
          firstName = impressum.firstName
          lastName = impressum.lastName
        }
        foundingYear = impressum.foundingYear
        websiteAbout = about
        websiteHeadlines = extractHeadlines(html)
      }
    } catch { /* non-fatal */ }

    // Update lead with enrichment data
    const logoBase64 = logoBuffer ? logoBuffer.toString('base64') : null
    await supabase.from('leads').update({
      enrichment_status: 'completed',
      logo_url: scrapeResult.bestLogo?.url || lead.logo_url,
      logo_source: logoSource || lead.logo_source,
      dominant_color: passColors.backgroundColor,
      text_color: passColors.textColor,
      label_color: passColors.labelColor,
      accent_color: passColors.accentColor,
      website_description: scrapeResult.description || lead.website_description,
      contact_name: contactName,
      social_links: scrapeResult.socialLinks || lead.social_links,
      has_existing_loyalty: scrapeResult.loyaltyDetected || lead.has_existing_loyalty,
      has_app: scrapeResult.appDetected || lead.has_app,
      extra_data: {
        ...(lead.extra_data as Record<string, unknown> || {}),
        contact_first_name: firstName,
        contact_last_name: lastName,
        founding_year: foundingYear,
        website_headlines: websiteHeadlines,
        website_about: websiteAbout,
      },
    }).eq('id', id)

    steps.scrape = {
      success: true,
      durationMs: Date.now() - scrapeStart,
      title: scrapeResult.title,
      logo: scrapeResult.bestLogo?.url ? 'found' : 'none',
      colors: { bg: passColors.backgroundColor, label: passColors.labelColor },
      contactName,
      foundingYear,
    }

    // ═══ STEP 2: AI Classification ════════════════════════════
    const classifyStart = Date.now()
    try {
      const classification = await classifyBusiness({
        business_name: lead.business_name,
        website_description: scrapeResult.description,
        gmaps_category: (lead.extra_data as Record<string, unknown>)?.gmaps_category as string || lead.industry,
        city: lead.city,
      })

      if (classification) {
        await supabase.from('leads').update({
          detected_industry: classification.detected_industry,
          detected_reward: classification.detected_reward,
          detected_reward_emoji: classification.detected_reward_emoji,
          detected_stamp_emoji: classification.detected_stamp_emoji,
          detected_pass_title: classification.detected_pass_title,
          detected_max_stamps: classification.detected_max_stamps,
          email_hooks: classification.email_hooks,
          personalization_notes: classification.personalization_notes,
        }).eq('id', id)

        steps.classify = {
          success: true,
          durationMs: Date.now() - classifyStart,
          industry: classification.detected_industry,
          reward: classification.detected_reward,
        }
      }
    } catch (err) {
      steps.classify = { success: false, error: err instanceof Error ? err.message : 'Failed' }
    }

    // ═══ STEP 3: Generate Pass ════════════════════════════════
    const passStart = Date.now()
    try {
      // Re-fetch lead with updated data
      const { data: updatedLead } = await supabase.from('leads').select('*').eq('id', id).single()
      if (updatedLead) {
        const passResult = await generatePassesForLead(updatedLead as Lead)

        await supabase.from('leads').update({
          pass_status: 'ready',
          pass_serial: passResult.passSerial,
          pass_auth_token: passResult.passAuthToken,
          apple_pass_url: passResult.applePassUrl,
          google_pass_url: passResult.googleSaveUrl,
          strip_image_url: passResult.stripPublicUrl || updatedLead.strip_image_url,
        }).eq('id', id)

        steps.pass = {
          success: true,
          durationMs: Date.now() - passStart,
          serial: passResult.passSerial,
          downloadUrl: `/api/passes/${passResult.passSerial}`,
        }
      }
    } catch (err) {
      steps.pass = { success: false, error: err instanceof Error ? err.message : 'Failed' }
    }

    // ═══ STEP 4: Generate Download Page Slug ══════════════════
    if (!lead.download_page_slug) {
      const slugBase = lead.business_name
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60)
      const slug = `${slugBase}-${id.substring(0, 6)}`
      await supabase.from('leads').update({ download_page_slug: slug }).eq('id', id)
      steps.downloadPage = { slug, url: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/d/${slug}` }
    } else {
      steps.downloadPage = { slug: lead.download_page_slug, url: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/d/${lead.download_page_slug}` }
    }

    // ═══ STEP 5: Generate 5 Emails ════════════════════════════
    const emailStart = Date.now()
    const { data: finalLead } = await supabase.from('leads').select('*').eq('id', id).single()
    if (finalLead) {
      const fl = finalLead as Lead
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://autrich.vercel.app'
      const downloadUrl = fl.download_page_slug ? `${baseUrl}/d/${fl.download_page_slug}` : baseUrl
      const extra = (fl.extra_data || {}) as Record<string, unknown>

      const emailInput = {
        business_name: fl.business_name,
        contact_name: fl.contact_name || null,
        contact_first_name: (extra.contact_first_name as string) || (fl.contact_name ? fl.contact_name.split(' ')[0] : null),
        contact_last_name: (extra.contact_last_name as string) || (fl.contact_name ? fl.contact_name.split(' ').slice(-1)[0] : null),
        city: fl.city || null,
        industry: fl.detected_industry || fl.industry || null,
        website_description: fl.website_description || null,
        website_about: (extra.website_about as string) || null,
        website_headlines: (extra.website_headlines as string) || null,
        founding_year: (extra.founding_year as number) || null,
        google_rating: fl.google_rating ? Number(fl.google_rating) : null,
        google_reviews_count: fl.google_reviews_count || null,
        has_existing_loyalty: fl.has_existing_loyalty || false,
        has_app: fl.has_app || false,
        email_hooks: (fl.email_hooks as string[]) || [],
        personalization_notes: fl.personalization_notes || null,
        detected_reward: fl.detected_reward || null,
        download_url: downloadUrl,
        formal: false,
      }

      const strategies: EmailStrategy[] = ['curiosity', 'social_proof', 'direct', 'storytelling', 'provocation']
      const emails = []
      for (const strategy of strategies) {
        try {
          const result = await writeEmail({ ...emailInput, strategy })
          emails.push(result)
        } catch (err) {
          emails.push({ strategy, error: err instanceof Error ? err.message : 'Failed' })
        }
      }

      // Save first (curiosity) as default
      const first = emails[0]
      if (first && 'subject' in first && 'body' in first) {
        await supabase.from('leads').update({
          email_subject: first.subject,
          email_body: first.body,
          email_strategy: 'curiosity',
          email_status: 'review',
        }).eq('id', id)
      }

      steps.emails = {
        success: true,
        durationMs: Date.now() - emailStart,
        count: emails.length,
        results: emails,
      }
    }

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - startTime,
      steps,
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Pipeline fehlgeschlagen',
      steps,
      durationMs: Date.now() - startTime,
    }, { status: 500 })
  }
}
