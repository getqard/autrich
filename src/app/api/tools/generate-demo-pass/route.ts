import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { generateApplePass } from '@/lib/wallet/apple'
import { generateGoogleSaveLink } from '@/lib/wallet/google'
import { matchStripTemplate } from '@/lib/wallet/strip'
import { applyStripGradient } from '@/lib/wallet/strip-generator'
import { mapGmapsCategory } from '@/data/gmaps-category-map'
import { INDUSTRIES } from '@/data/industries-seed'
import { classifyBusiness } from '@/lib/ai/classifier'

/**
 * POST /api/tools/generate-demo-pass
 *
 * All-in-one: Takes scrape enrichment data → generates Apple + Google passes.
 * Handles industry detection, strip matching, gradient, and pass generation.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const {
      business_name,
      url,
      logo_base64,
      background_color = '#1a1a2e',
      text_color = '#ffffff',
      label_color = '#999999',
      industry_slug: inputIndustrySlug,
      gmaps_category,
      address,
      phone,
      website,
      opening_hours,
    } = body

    if (!business_name) {
      return NextResponse.json({ error: 'business_name ist erforderlich' }, { status: 400 })
    }

    // ─── 1. Industry bestimmen ───────────────────────────────
    let industrySlug: string | null = inputIndustrySlug || null
    let classificationResult: Record<string, unknown> | null = null

    // Try gmaps mapping if no slug yet
    if (!industrySlug && gmaps_category) {
      industrySlug = mapGmapsCategory(gmaps_category, [])
    }

    // AI Classifier fallback
    if (!industrySlug) {
      try {
        const aiResult = await classifyBusiness({
          business_name,
          website_description: null,
          gmaps_category: gmaps_category || null,
          city: null,
        })
        if (aiResult) {
          industrySlug = aiResult.detected_industry
          classificationResult = aiResult as unknown as Record<string, unknown>
        }
      } catch (err) {
        console.log(`[Demo Pass] AI classification failed: ${err instanceof Error ? err.message : err}`)
      }
    }

    // Fallback to generic
    if (!industrySlug) industrySlug = 'generic'

    // ─── 2. Industry Defaults laden ──────────────────────────
    const industry = INDUSTRIES.find(i => i.slug === industrySlug) as
      { slug: string; name: string; emoji: string; default_reward: string; default_stamp_emoji: string; default_max_stamps: number } | undefined
    const reward = (classificationResult?.detected_reward as string)
      || industry?.default_reward || 'Überraschung'
    const stampEmoji = (classificationResult?.detected_stamp_emoji as string)
      || industry?.default_stamp_emoji || industry?.emoji || '⭐'
    const rewardEmoji = (classificationResult?.detected_reward_emoji as string)
      || industry?.emoji || '🎉'
    const maxStamps = (classificationResult?.detected_max_stamps as number)
      || industry?.default_max_stamps || 10
    const passTitle = (classificationResult?.detected_pass_title as string)
      || 'Treuekarte'

    // ─── 3. Logo vorbereiten ─────────────────────────────────
    let logoBuffer: Buffer | null = null
    if (logo_base64) {
      logoBuffer = Buffer.from(logo_base64, 'base64')
    }

    // ─── 4. Strip Template ───────────────────────────────────
    let stripBuffer: Buffer | null = null
    let stripPublicUrl: string | null = null
    let stripInfo: Record<string, unknown> = {}

    const match = await matchStripTemplate(industrySlug, label_color)
    if (match) {
      stripInfo = {
        family: match.accentFamily,
        tier: match.tier,
        templateUrl: match.imageUrl,
      }

      try {
        const templateRes = await fetch(match.imageUrl)
        if (templateRes.ok) {
          const rawStrip = Buffer.from(await templateRes.arrayBuffer())
          stripBuffer = await applyStripGradient(rawStrip, background_color)

          // Upload gradient strip to storage for Google URL
          const supabase = createServiceClient()
          const stripPath = `demo-${Date.now()}-strip.png`
          const { error: upErr } = await supabase.storage
            .from('passes')
            .upload(stripPath, stripBuffer, { contentType: 'image/png', upsert: true })

          if (!upErr) {
            const { data } = supabase.storage.from('passes').getPublicUrl(stripPath)
            stripPublicUrl = data.publicUrl
          }
        }
      } catch (err) {
        console.log(`[Demo Pass] Strip processing failed: ${err instanceof Error ? err.message : err}`)
      }
    }

    // ─── 5. Passes generieren ────────────────────────────────
    const serial = randomUUID()
    const authToken = randomUUID()
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://autrich.vercel.app'
    const barcodeUrl = `${baseUrl}/d/demo-${serial.substring(0, 8)}`

    const commonData = {
      serial,
      authToken,
      businessName: business_name,
      passTitle,
      backgroundColor: background_color,
      textColor: text_color,
      labelColor: label_color,
      stampEmoji,
      currentStamps: 3,
      maxStamps,
      reward,
      rewardEmoji,
      barcodeUrl,
      address: address || null,
      phone: phone || null,
      openingHours: opening_hours || null,
      website: website || url || null,
    }

    const result: Record<string, unknown> = {
      success: true,
      industry: {
        slug: industrySlug,
        name: industry?.name || industrySlug,
        emoji: industry?.emoji || null,
        reward,
        stampEmoji,
        maxStamps,
        passTitle,
        method: classificationResult ? 'ai' : (inputIndustrySlug ? 'enrichment' : 'gmaps'),
      },
      strip: stripInfo,
    }

    // Apple Pass
    try {
      const appleBuffer = await generateApplePass({
        ...commonData,
        logoBuffer,
        stripBuffer,
      })

      const supabase = createServiceClient()
      const pkpassPath = `${serial}.pkpass`
      await supabase.storage.from('passes').upload(pkpassPath, appleBuffer, {
        contentType: 'application/vnd.apple.pkpass',
        upsert: true,
      })

      result.apple = {
        serial,
        downloadUrl: `/api/passes/${serial}`,
        sizeBytes: appleBuffer.length,
      }
    } catch (err) {
      result.apple = { error: err instanceof Error ? err.message : 'Apple pass generation failed' }
    }

    // Google Save Link
    try {
      // Logo public URL: upload base64 to storage for Google
      let logoPublicUrl: string | null = null
      if (logoBuffer) {
        const supabase = createServiceClient()
        const logoPath = `demo-${serial.substring(0, 8)}-logo.png`
        const { error: upErr } = await supabase.storage
          .from('passes')
          .upload(logoPath, logoBuffer, { contentType: 'image/png', upsert: true })
        if (!upErr) {
          const { data } = supabase.storage.from('passes').getPublicUrl(logoPath)
          logoPublicUrl = data.publicUrl
        }
      }

      const { url: googleSaveUrl } = generateGoogleSaveLink({
        ...commonData,
        logoPublicUrl,
        stripPublicUrl,
      })

      result.google = { saveUrl: googleSaveUrl }
    } catch (err) {
      result.google = { error: err instanceof Error ? err.message : 'Google pass generation failed' }
    }

    result.durationMs = Date.now() - startTime
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Demo-Pass Generierung fehlgeschlagen' },
      { status: 500 }
    )
  }
}
