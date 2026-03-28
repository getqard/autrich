import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generatePassesForLead } from '@/lib/wallet/pass-data'
import { writeEmail, type EmailStrategy } from '@/lib/email/writer'
import { classifyBusiness } from '@/lib/ai/classifier'
import { INDUSTRIES } from '@/data/industries-seed'
import { mapGmapsCategory } from '@/data/gmaps-category-map'
import type { Lead } from '@/lib/supabase/types'

/**
 * POST /api/leads/[id]/run-pipeline
 *
 * Runs the COMPLETE pipeline on a single lead:
 * 1. Scrape website via /api/tools/scrape (SAME logic as scraper tool)
 * 2. AI Classification (industry, reward, hooks)
 * 3. Generate Pass (Apple + Google + download page)
 * 4. Generate 5 Emails (all strategies)
 *
 * Uses the scraper tool internally to guarantee identical results.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()
  const startTime = Date.now()

  const { data: lead, error: fetchErr } = await supabase
    .from('leads').select('*').eq('id', id).single()

  if (fetchErr || !lead) {
    return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 })
  }
  if (!lead.website_url) {
    return NextResponse.json({ error: 'Lead hat keine Website-URL' }, { status: 400 })
  }

  const steps: Record<string, unknown> = {}
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://autrich.vercel.app'

  try {
    // ═══ STEP 1: Scrape via /api/tools/scrape ═══════════════════
    // This uses the EXACT same logic as the scraper tool:
    // - Third-party logo filter
    // - Business name matching
    // - Logo fallbacks (Instagram, Favicon, Generated)
    // - Logo contrast check + swap
    // - SVG→PNG rasterization
    // - allowScreenshotFallback: true
    // - Industry color defaults
    // - Caching
    const scrapeStart = Date.now()

    const gmapsExtra = (lead.extra_data || {}) as Record<string, unknown>
    const scrapeBody = {
      url: lead.website_url,
      business_name: lead.business_name,
      gmaps_category: gmapsExtra.gmaps_category || lead.industry || null,
      gmaps_categories: gmapsExtra.gmaps_categories || [],
      force: true, // Always fresh — cached data might have old color/logo logic
    }

    // Call our own scrape endpoint internally
    const scrapeOrigin = request.headers.get('host')
      ? `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`
      : baseUrl

    const scrapeRes = await fetch(`${scrapeOrigin}/api/tools/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scrapeBody),
    })

    const scrapeData = await scrapeRes.json()

    if (!scrapeRes.ok) {
      steps.scrape = { success: false, error: scrapeData.error || 'Scrape failed' }
    } else {
      const ep = scrapeData.enrichmentPreview
      const impressum = scrapeData.impressum

      // Update lead with enrichment data
      const updateData: Record<string, unknown> = {
        enrichment_status: 'completed',
        website_description: scrapeData.description || lead.website_description,
        social_links: scrapeData.socialLinks || lead.social_links,
        has_existing_loyalty: scrapeData.loyaltyDetected || lead.has_existing_loyalty,
        has_app: scrapeData.appDetected || lead.has_app,
      }

      if (ep?.logo?.base64) {
        // Upload the FINAL logo (after contrast swap) to storage
        // This is the actual logo that will be used — not the original bestLogo
        try {
          const logoBuffer = Buffer.from(ep.logo.base64, 'base64')
          const logoPath = `lead-logos/${id}.png`
          await supabase.storage.from('scrape-cache').upload(logoPath, logoBuffer, {
            contentType: 'image/png', upsert: true,
          })
          const { data: logoUrlData } = supabase.storage.from('scrape-cache').getPublicUrl(logoPath)
          updateData.logo_url = logoUrlData.publicUrl
          updateData.logo_source = ep.logo.source
        } catch {
          // Fallback to bestLogo URL
          updateData.logo_url = scrapeData.bestLogo?.url || lead.logo_url
          updateData.logo_source = ep.logo.source || lead.logo_source
        }
      }
      if (ep?.passPreview) {
        updateData.dominant_color = ep.passPreview.bg
        updateData.text_color = ep.passPreview.text
        updateData.label_color = ep.passPreview.label
        // accent_color = label color (the actual brand accent), NOT palette color
        updateData.accent_color = ep.passPreview.label
      }
      if (impressum?.contactName && !lead.contact_name) {
        updateData.contact_name = impressum.contactName
      }

      // Store extra enrichment data
      const existingExtra = (lead.extra_data || {}) as Record<string, unknown>
      updateData.extra_data = {
        ...existingExtra,
        contact_first_name: impressum?.firstName || existingExtra.contact_first_name,
        contact_last_name: impressum?.lastName || existingExtra.contact_last_name,
        founding_year: impressum?.foundingYear || scrapeData.impressum?.foundingYear || existingExtra.founding_year,
        website_headlines: scrapeData.websiteHeadlines || existingExtra.website_headlines,
        website_about: scrapeData.websiteAbout || existingExtra.website_about,
      }

      await supabase.from('leads').update(updateData).eq('id', id)

      steps.scrape = {
        success: true,
        durationMs: Date.now() - scrapeStart,
        title: scrapeData.title,
        logo: ep?.logo ? `${ep.logo.source}` : 'none',
        colors: ep?.passPreview ? { bg: ep.passPreview.bg, label: ep.passPreview.label } : null,
        contactName: impressum?.contactName || lead.contact_name,
        foundingYear: impressum?.foundingYear,
        cached: scrapeData._cache?.hit || false,
      }
    }

    // ═══ STEP 2: AI Classification ════════════════════════════════
    const classifyStart = Date.now()
    try {
      // First try GMaps category mapping
      let industrySlug: string | null = null
      const gmapsCat = gmapsExtra.gmaps_category as string || lead.industry
      if (gmapsCat) {
        industrySlug = mapGmapsCategory(gmapsCat, (gmapsExtra.gmaps_categories as string[]) || [])
      }

      // If no GMaps match, use AI
      if (!industrySlug) {
        const classification = await classifyBusiness({
          business_name: lead.business_name,
          website_description: scrapeData?.description || lead.website_description,
          gmaps_category: gmapsCat || null,
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

          industrySlug = classification.detected_industry
          steps.classify = {
            success: true,
            durationMs: Date.now() - classifyStart,
            industry: classification.detected_industry,
            reward: classification.detected_reward,
            method: 'ai',
          }
        }
      } else {
        // Use industry defaults from GMaps mapping
        const ind = INDUSTRIES.find(i => i.slug === industrySlug) as
          { slug: string; name: string; emoji: string; default_reward: string; default_stamp_emoji: string; default_max_stamps: number } | undefined

        if (ind) {
          await supabase.from('leads').update({
            detected_industry: ind.slug,
            detected_reward: ind.default_reward,
            detected_stamp_emoji: ind.default_stamp_emoji,
            detected_max_stamps: ind.default_max_stamps,
            detected_pass_title: 'Treuekarte',
          }).eq('id', id)
        }

        steps.classify = {
          success: true,
          durationMs: Date.now() - classifyStart,
          industry: industrySlug,
          method: 'gmaps',
        }
      }
    } catch (err) {
      steps.classify = { success: false, error: err instanceof Error ? err.message : 'Failed' }
    }

    // ═══ STEP 3: Generate Download Page Slug ══════════════════════
    if (!lead.download_page_slug) {
      const slugBase = lead.business_name
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60)
      const slug = `${slugBase}-${id.substring(0, 6)}`
      await supabase.from('leads').update({ download_page_slug: slug }).eq('id', id)
      steps.downloadPage = { slug, url: `${baseUrl}/d/${slug}` }
    } else {
      steps.downloadPage = { slug: lead.download_page_slug, url: `${baseUrl}/d/${lead.download_page_slug}` }
    }

    // ═══ STEP 4: Generate Pass ════════════════════════════════════
    const passStart = Date.now()
    try {
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

    // ═══ STEP 5: Generate 5 Emails ════════════════════════════════
    const emailStart = Date.now()
    try {
      const { data: finalLead } = await supabase.from('leads').select('*').eq('id', id).single()
      if (finalLead) {
        const fl = finalLead as Lead
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
    } catch (err) {
      steps.emails = { success: false, error: err instanceof Error ? err.message : 'Failed' }
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
