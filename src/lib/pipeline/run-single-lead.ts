/**
 * Pipeline für einen einzelnen Lead — gesplittet in 2 Phasen (Block 3).
 *
 * Phase A — Enrichment (runEnrichmentForLead):
 *   1. Scrape website (logo, colors, impressum, social)
 *   2. AI Classification (industry, reward, hooks)
 *   → Setzt enrichment_status='completed'
 *   → Gated durch triage_status='approved'
 *
 * Phase B — Pass+Email (runPassEmailForLead):
 *   3. Generate Download Page Slug
 *   4. Generate Pass (Apple + Google)
 *   5. A/B-Group zuweisen + 1 Email generieren
 *   → Setzt pass_status='ready', email_status='review'
 *   → Gated durch enrichment_review_status='approved'
 *
 * runPipelineForLead läuft beide Phasen nacheinander (Legacy / Single-Lead-Button).
 */

import { generatePassesForLead } from '@/lib/wallet/pass-data'
import { writeEmail } from '@/lib/email/writer'
import { assignABGroup } from '@/lib/email/ab-assignment'
import { classifyBusiness } from '@/lib/ai/classifier'
import { INDUSTRIES } from '@/data/industries-seed'
import { mapGmapsCategory } from '@/data/gmaps-category-map'
import type { Lead } from '@/lib/supabase/types'
import type { SupabaseClient } from '@supabase/supabase-js'

export type PipelineResult = {
  success: boolean
  durationMs: number
  steps: Record<string, unknown>
  error?: string
}

/**
 * Phase A — Enrichment: Scrape + AI-Klassifikation.
 * Läuft nur auf Leads mit triage_status='approved'.
 */
export async function runEnrichmentForLead(
  leadId: string,
  supabase: SupabaseClient,
  baseUrl: string,
): Promise<PipelineResult> {
  const startTime = Date.now()
  const steps: Record<string, unknown> = {}

  const { data: lead, error: fetchErr } = await supabase
    .from('leads').select('*').eq('id', leadId).single()

  if (fetchErr || !lead) {
    return { success: false, durationMs: Date.now() - startTime, steps, error: 'Lead nicht gefunden' }
  }
  if (!lead.website_url) {
    return { success: false, durationMs: Date.now() - startTime, steps, error: 'Lead hat keine Website-URL' }
  }
  if (lead.triage_status !== 'approved') {
    return { success: false, durationMs: Date.now() - startTime, steps, error: `Lead nicht triage-approved (status: ${lead.triage_status})` }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let scrapeData: any = null

  try {
    // ═══ STEP 1: Scrape via /api/tools/scrape ═══════════════════
    const scrapeStart = Date.now()

    const gmapsExtra = (lead.extra_data || {}) as Record<string, unknown>
    const scrapeBody = {
      url: lead.website_url,
      business_name: lead.business_name,
      gmaps_category: gmapsExtra.gmaps_category || lead.industry || null,
      gmaps_categories: gmapsExtra.gmaps_categories || [],
      force: true,
    }

    console.log(`[Enrich] Calling scraper: ${baseUrl}/api/tools/scrape`)
    const scrapeRes = await fetch(`${baseUrl}/api/tools/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scrapeBody),
    })

    scrapeData = await scrapeRes.json()

    if (!scrapeRes.ok) {
      steps.scrape = { success: false, error: scrapeData.error || 'Scrape failed' }
      await supabase.from('leads').update({ enrichment_status: 'failed' }).eq('id', leadId)
      return { success: false, durationMs: Date.now() - startTime, steps, error: scrapeData.error || 'Scrape failed' }
    }

    const ep = scrapeData.enrichmentPreview
    const impressum = scrapeData.impressum

    const updateData: Record<string, unknown> = {
      enrichment_status: 'completed',
      website_description: scrapeData.description || lead.website_description,
      social_links: scrapeData.socialLinks || lead.social_links,
      has_existing_loyalty: scrapeData.loyaltyDetected || lead.has_existing_loyalty,
      has_app: scrapeData.appDetected || lead.has_app,
    }

    if (ep?.logo?.base64) {
      try {
        const logoBuffer = Buffer.from(ep.logo.base64, 'base64')
        const logoPath = `lead-logos/${leadId}.png`
        const { error: upErr } = await supabase.storage.from('scrape-cache').upload(logoPath, logoBuffer, {
          contentType: 'image/png', upsert: true,
        })
        if (upErr) {
          updateData.logo_url = scrapeData.bestLogo?.url || lead.logo_url
        } else {
          const { data: logoUrlData } = supabase.storage.from('scrape-cache').getPublicUrl(logoPath)
          updateData.logo_url = logoUrlData.publicUrl
        }
        const srcMap: Record<string, string> = { 'apple-touch-icon': 'website', 'header-logo': 'website', 'favicon': 'website', 'link-icon': 'website', 'og-image': 'website', 'footer-logo': 'website', 'inline-svg': 'website', 'ai-picked': 'website' }
        updateData.logo_source = srcMap[ep.logo.source] || ((['website','instagram','google','generated'].includes(ep.logo.source)) ? ep.logo.source : 'website')
      } catch (err) {
        updateData.logo_url = scrapeData.bestLogo?.url || lead.logo_url
        const srcMap: Record<string, string> = { 'apple-touch-icon': 'website', 'header-logo': 'website', 'favicon': 'website', 'link-icon': 'website', 'og-image': 'website', 'footer-logo': 'website', 'inline-svg': 'website', 'ai-picked': 'website' }
        updateData.logo_source = srcMap[ep.logo.source] || ((['website','instagram','google','generated'].includes(ep.logo.source)) ? ep.logo.source : 'website') || lead.logo_source
        console.log(`[Enrich] Logo upload error: ${err instanceof Error ? err.message : err}`)
      }
    }

    if (ep?.passPreview) {
      updateData.dominant_color = ep.passPreview.bg
      updateData.text_color = ep.passPreview.text
      updateData.label_color = ep.passPreview.label
      updateData.accent_color = ep.passPreview.label
    }
    if (impressum?.contactName && !lead.contact_name) {
      updateData.contact_name = impressum.contactName
    }

    const existingExtra = (lead.extra_data || {}) as Record<string, unknown>
    updateData.extra_data = {
      ...existingExtra,
      contact_first_name: impressum?.firstName || existingExtra.contact_first_name,
      contact_last_name: impressum?.lastName || existingExtra.contact_last_name,
      founding_year: impressum?.foundingYear || scrapeData.impressum?.foundingYear || existingExtra.founding_year,
      website_headlines: scrapeData.websiteHeadlines || existingExtra.website_headlines,
      website_about: scrapeData.websiteAbout || existingExtra.website_about,
    }

    const { error: updateErr } = await supabase.from('leads').update(updateData).eq('id', leadId)
    if (updateErr) console.log(`[Enrich] Lead update FAILED: ${updateErr.message}`)

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

    // ═══ STEP 2: AI Classification ════════════════════════════════
    const classifyStart = Date.now()
    try {
      let industrySlug: string | null = null
      const gmapsCat = gmapsExtra.gmaps_category as string || lead.industry
      if (gmapsCat) {
        industrySlug = mapGmapsCategory(gmapsCat, (gmapsExtra.gmaps_categories as string[]) || [])
      }

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
          }).eq('id', leadId)

          steps.classify = {
            success: true,
            durationMs: Date.now() - classifyStart,
            industry: classification.detected_industry,
            reward: classification.detected_reward,
            method: 'ai',
          }
        }
      } else {
        const ind = INDUSTRIES.find(i => i.slug === industrySlug) as
          { slug: string; name: string; emoji: string; default_reward: string; default_stamp_emoji: string; default_max_stamps: number } | undefined

        if (ind) {
          await supabase.from('leads').update({
            detected_industry: ind.slug,
            detected_reward: ind.default_reward,
            detected_stamp_emoji: ind.default_stamp_emoji,
            detected_max_stamps: ind.default_max_stamps,
            detected_pass_title: 'Treuekarte',
          }).eq('id', leadId)
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

    return { success: true, durationMs: Date.now() - startTime, steps }
  } catch (err) {
    await supabase.from('leads').update({ enrichment_status: 'failed' }).eq('id', leadId)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Enrichment fehlgeschlagen',
      durationMs: Date.now() - startTime,
      steps,
    }
  }
}

/**
 * Phase B — Pass + Email: Slug + Pass-Generation + A/B-Group + Email.
 * Läuft nur auf Leads mit enrichment_review_status='approved'.
 */
export async function runPassEmailForLead(
  leadId: string,
  supabase: SupabaseClient,
  baseUrl: string,
): Promise<PipelineResult> {
  const startTime = Date.now()
  const steps: Record<string, unknown> = {}
  const downloadBaseUrl = process.env.NEXT_PUBLIC_DOWNLOAD_BASE_URL || baseUrl

  const { data: lead, error: fetchErr } = await supabase
    .from('leads').select('*').eq('id', leadId).single()

  if (fetchErr || !lead) {
    return { success: false, durationMs: Date.now() - startTime, steps, error: 'Lead nicht gefunden' }
  }
  if (lead.enrichment_review_status !== 'approved') {
    return { success: false, durationMs: Date.now() - startTime, steps, error: `Lead nicht enrichment-approved (status: ${lead.enrichment_review_status})` }
  }

  try {
    // ═══ STEP 3: Generate Download Page Slug ══════════════════════
    if (!lead.download_page_slug) {
      const slugBase = lead.business_name
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60)
      const slug = `${slugBase}-${leadId.substring(0, 6)}`
      await supabase.from('leads').update({ download_page_slug: slug }).eq('id', leadId)
      steps.downloadPage = { slug, url: `${downloadBaseUrl}/d/${slug}` }
    } else {
      steps.downloadPage = { slug: lead.download_page_slug, url: `${downloadBaseUrl}/d/${lead.download_page_slug}` }
    }

    // ═══ STEP 4: Generate Pass ════════════════════════════════════
    const passStart = Date.now()
    try {
      const { data: updatedLead } = await supabase.from('leads').select('*').eq('id', leadId).single()
      if (updatedLead) {
        const passResult = await generatePassesForLead(updatedLead as Lead)

        await supabase.from('leads').update({
          pass_status: 'ready',
          pass_serial: passResult.passSerial,
          pass_auth_token: passResult.passAuthToken,
          apple_pass_url: passResult.applePassUrl,
          google_pass_url: passResult.googleSaveUrl,
          strip_image_url: passResult.stripPublicUrl || updatedLead.strip_image_url,
        }).eq('id', leadId)

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

    // ═══ STEP 5: A/B-Group + 1 Email generieren ═══════════════════
    const emailStart = Date.now()
    try {
      const { data: finalLead } = await supabase.from('leads').select('*').eq('id', leadId).single()
      if (finalLead) {
        const fl = finalLead as Lead
        const downloadUrl = fl.download_page_slug ? `${downloadBaseUrl}/d/${fl.download_page_slug}` : downloadBaseUrl
        const extra = (fl.extra_data || {}) as Record<string, unknown>

        let abGroup = fl.ab_group
        if (!abGroup && fl.campaign_id) {
          const assignment = await assignABGroup(fl.campaign_id, supabase)
          abGroup = assignment.strategy
          console.log(`[PassEmail] Assigned ab_group: ${abGroup} for lead ${leadId} (counts: ${JSON.stringify(assignment.counts)})`)
          await supabase.from('leads').update({ ab_group: abGroup }).eq('id', leadId)
        }

        const strategy = abGroup || 'curiosity'

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
          strategy,
        }

        const result = await writeEmail(emailInput)

        const existingVariants = (fl.email_variants || {}) as Record<string, { subject: string; body: string }>
        const variants = {
          ...existingVariants,
          [strategy]: { subject: result.subject, body: result.body },
        }

        await supabase.from('leads').update({
          email_subject: result.subject,
          email_body: result.body,
          email_strategy: strategy,
          email_status: 'review',
          email_variants: variants,
        }).eq('id', leadId)

        steps.emails = {
          success: true,
          durationMs: Date.now() - emailStart,
          count: 1,
          ab_group: strategy,
          results: [result],
        }
      }
    } catch (err) {
      steps.emails = { success: false, error: err instanceof Error ? err.message : 'Failed' }
    }

    return { success: true, durationMs: Date.now() - startTime, steps }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Pass/Email fehlgeschlagen',
      durationMs: Date.now() - startTime,
      steps,
    }
  }
}

/**
 * Legacy / Single-Lead-Button: läuft beide Phasen nacheinander.
 * Überspringt Gates (setzt sie temporär auf 'approved', falls nötig), damit der
 * existierende "Run Full Pipeline"-Button pro Lead weiter funktioniert.
 */
export async function runPipelineForLead(
  leadId: string,
  supabase: SupabaseClient,
  baseUrl: string,
): Promise<PipelineResult> {
  const startTime = Date.now()
  const allSteps: Record<string, unknown> = {}

  // Force-approve für manuellen Single-Lead-Run (Dashboard-Button).
  await supabase.from('leads').update({
    triage_status: 'approved',
    enrichment_review_status: 'approved',
  }).eq('id', leadId)

  const enrich = await runEnrichmentForLead(leadId, supabase, baseUrl)
  allSteps.enrichment = enrich.steps
  if (!enrich.success) {
    return {
      success: false,
      error: enrich.error,
      durationMs: Date.now() - startTime,
      steps: allSteps,
    }
  }

  const pe = await runPassEmailForLead(leadId, supabase, baseUrl)
  allSteps.passEmail = pe.steps
  if (!pe.success) {
    return {
      success: false,
      error: pe.error,
      durationMs: Date.now() - startTime,
      steps: allSteps,
    }
  }

  return { success: true, durationMs: Date.now() - startTime, steps: allSteps }
}
