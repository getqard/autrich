import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { scrapeWebsite } from '@/lib/enrichment/scraper'
import { processLogo, validateLogoCandidate, fetchGoogleFavicon, generateInitialsLogo } from '@/lib/enrichment/logo'
import { pickBestLogo } from '@/lib/enrichment/logo-picker'
import { extractPalette, derivePassColors, adjustBgForContrast } from '@/lib/enrichment/colors'
import { fetchBrandfetchLogo } from '@/lib/enrichment/brandfetch'
import { fetchGmapsPhoto, cropToSquare } from '@/lib/enrichment/gmaps-photo'
import { classifyIndustry, classifyBusiness, generateCreativeContent } from '@/lib/ai/classifier'
import { calculateLeadScore } from '@/lib/enrichment/score'
import { INDUSTRIES } from '@/data/industries-seed'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  // Load lead
  const { data: lead, error: loadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (loadError || !lead) {
    return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 })
  }

  // Set processing status
  await supabase.from('leads').update({ enrichment_status: 'processing' }).eq('id', id)

  try {
    const updateData: Record<string, unknown> = {}

    // ─── 1. CLASSIFICATION (instant, $0) ────────────────────

    const extraCategories: string[] = Array.isArray((lead.extra_data as Record<string, unknown>)?.categories)
      ? (lead.extra_data as Record<string, unknown>).categories as string[]
      : []

    const classResult = classifyIndustry(
      lead.gmaps_category,
      extraCategories,
      lead.business_name,
      lead.industry,
    )

    let industry: string
    let industryMethod: string

    if (classResult) {
      industry = classResult.industry
      industryMethod = classResult.method
    } else {
      // AI fallback
      const aiResult = await classifyBusiness({
        business_name: lead.business_name,
        industry: lead.industry,
        city: lead.city,
        website_description: lead.website_description,
        gmaps_category: lead.gmaps_category,
        categories: extraCategories,
        google_rating: lead.google_rating,
        google_reviews_count: lead.google_reviews_count,
        has_existing_loyalty: lead.has_existing_loyalty,
        has_app: lead.has_app,
        social_links: lead.social_links,
      })
      industry = aiResult.detected_industry
      industryMethod = 'ai'

      // If AI did full classification, store the creative results too
      updateData.detected_reward = aiResult.detected_reward
      updateData.detected_reward_emoji = aiResult.detected_reward_emoji
      updateData.detected_stamp_emoji = aiResult.detected_stamp_emoji
      updateData.detected_pass_title = aiResult.detected_pass_title
      updateData.detected_max_stamps = aiResult.detected_max_stamps
      updateData.strip_prompt = aiResult.strip_prompt
      updateData.email_hooks = aiResult.email_hooks
      updateData.personalization_notes = aiResult.personalization_notes
    }

    updateData.detected_industry = industry
    // Store method in extra_data
    const existingExtra = (lead.extra_data as Record<string, unknown>) || {}
    updateData.extra_data = { ...existingExtra, industry_method: industryMethod }

    const industryDefaults = INDUSTRIES.find(i => i.slug === industry)

    // ─── 2. WEBSITE SCRAPE (best effort) ────────────────────

    let scrapeResult = null
    if (lead.website_url) {
      try {
        scrapeResult = await scrapeWebsite(lead.website_url)

        updateData.website_description = scrapeResult.description
        updateData.social_links = scrapeResult.socialLinks
        updateData.structured_data = scrapeResult.structuredData
        updateData.has_existing_loyalty = scrapeResult.loyaltyDetected
        updateData.has_app = scrapeResult.appDetected

        if (scrapeResult.socialLinks.instagram) {
          updateData.instagram_handle = scrapeResult.socialLinks.instagram
        }
      } catch (err) {
        console.error('Website scrape failed (non-fatal):', err)
      }
    }

    // ─── 3. LOGO WATERFALL ──────────────────────────────────

    let logoBuffer: Buffer | null = null
    let logoSource: string = 'generated'
    const domain = lead.website_url
      ? new URL(lead.website_url).hostname.replace(/^www\./, '')
      : null

    // 3a. Brandfetch
    if (domain) {
      try {
        const bf = await fetchBrandfetchLogo(domain)
        if (bf) {
          logoBuffer = bf.buffer
          logoSource = bf.source
        }
      } catch (err) {
        console.error('Brandfetch failed (non-fatal):', err)
      }
    }

    // 3b. Website Scraping Logo (with AI Picker)
    if (!logoBuffer && scrapeResult?.logoCandidates?.length) {
      const sortedCandidates = [...scrapeResult.logoCandidates]
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)

      // Try AI Logo Picker if we have multiple candidates
      let aiPickedUrl: string | null = null
      if (sortedCandidates.length >= 2) {
        try {
          const aiPick = await pickBestLogo(sortedCandidates, lead.business_name)
          if (aiPick && aiPick.confidence >= 0.7) {
            const picked = sortedCandidates[aiPick.index]
            const validation = await validateLogoCandidate(picked.url)
            if (validation.valid) {
              aiPickedUrl = picked.url
            }
          }
        } catch (err) {
          console.error('AI Logo Picker failed (non-fatal):', err)
        }
      }

      // If AI picked a valid logo, use it. Otherwise fall back to score-based.
      if (aiPickedUrl) {
        try {
          const logoResult = await processLogo(aiPickedUrl)
          const thumbnailVariant = logoResult.variants.find(v => v.name === 'thumbnail')
          if (thumbnailVariant) {
            logoBuffer = thumbnailVariant.buffer
            logoSource = 'website'
          }
        } catch (err) {
          console.error('AI-picked logo processing failed (non-fatal):', err)
        }
      }

      // Score-based fallback
      if (!logoBuffer) {
        const topCandidates = sortedCandidates.slice(0, 3)
        const validations = await Promise.all(
          topCandidates.map(async (c: { url: string }) => ({
            candidate: c,
            validation: await validateLogoCandidate(c.url),
          }))
        )

        const bestValid = validations.find(v => v.validation.valid)
        if (bestValid) {
          try {
            const logoResult = await processLogo(bestValid.candidate.url)
            const thumbnailVariant = logoResult.variants.find(v => v.name === 'thumbnail')
            if (thumbnailVariant) {
              logoBuffer = thumbnailVariant.buffer
              logoSource = 'website'
            }
          } catch (err) {
            console.error('Website logo processing failed (non-fatal):', err)
          }
        }
      }
    }

    // 3c. GMaps Featured Image
    if (!logoBuffer && lead.gmaps_photos?.length > 0) {
      try {
        const photo = await fetchGmapsPhoto(lead.gmaps_photos[0])
        if (photo) {
          logoBuffer = await cropToSquare(photo)
          logoSource = 'gmaps'
        }
      } catch (err) {
        console.error('GMaps photo failed (non-fatal):', err)
      }
    }

    // 3d. Google Favicon
    if (!logoBuffer && domain) {
      try {
        const fav = await fetchGoogleFavicon(domain)
        if (fav) {
          logoBuffer = fav
          logoSource = 'favicon'
        }
      } catch (err) {
        console.error('Favicon failed (non-fatal):', err)
      }
    }

    // 3e. Generated Initials (never fails)
    if (!logoBuffer) {
      const color = industryDefaults?.default_color || '#1a1a2e'
      logoBuffer = await generateInitialsLogo(lead.business_name, color)
      logoSource = 'generated'
    }

    // Process logo + upload all variants
    try {
      const logoResult = await processLogo(logoBuffer)

      for (const variant of logoResult.variants) {
        await supabase.storage
          .from('enrichment')
          .upload(`logos/${id}/${variant.name}.png`, variant.buffer, {
            contentType: 'image/png',
            upsert: true,
          })
      }

      const { data: publicUrlData } = supabase.storage
        .from('enrichment')
        .getPublicUrl(`logos/${id}/logo@2x.png`)

      updateData.logo_url = publicUrlData.publicUrl
      updateData.logo_source = logoSource

      // Keep reference to thumbnail for color extraction
      logoBuffer = logoResult.variants.find(v => v.name === 'thumbnail')?.buffer ?? logoBuffer
    } catch (err) {
      console.error('Logo processing failed:', err)
    }

    // ─── 4. COLOR WATERFALL ─────────────────────────────────

    let bgHex: string | null = null
    let accentHex: string | null = null

    // 4a. CSS Brand Colors
    if (scrapeResult && scrapeResult.brandColors && scrapeResult.brandColors.confidence >= 0.6 && scrapeResult.brandColors.backgroundColor) {
      bgHex = scrapeResult.brandColors.backgroundColor
      accentHex = scrapeResult.brandColors.accentColor
    }

    // 4b. node-vibrant from logo
    if (!bgHex && logoBuffer) {
      try {
        const palette = await extractPalette(logoBuffer)
        bgHex = palette.dominant
        accentHex = palette.accent

        // Store full palette in extra_data
        const extra = (updateData.extra_data as Record<string, unknown>) || existingExtra
        updateData.extra_data = { ...extra, vibrant_swatches: palette.swatches }
      } catch (err) {
        console.error('Vibrant extraction failed (non-fatal):', err)
      }
    }

    // 4c. node-vibrant from GMaps photo
    if (!bgHex && lead.gmaps_photos?.length > 0) {
      try {
        const photo = await fetchGmapsPhoto(lead.gmaps_photos[0])
        if (photo) {
          const palette = await extractPalette(photo)
          bgHex = palette.dominant
          accentHex = palette.accent
        }
      } catch (err) {
        console.error('GMaps photo color extraction failed (non-fatal):', err)
      }
    }

    // 4d. Industry default
    if (!bgHex) {
      bgHex = industryDefaults?.default_color || '#1a1a2e'
      accentHex = industryDefaults?.default_accent || null
    }

    if (accentHex) {
      updateData.accent_color = accentHex
    }

    // Derive pass colors with WCAG contrast check
    const passColors = await derivePassColors(bgHex, accentHex, logoBuffer)

    if (passColors.logoContrast === 'low') {
      const adjusted = adjustBgForContrast(bgHex)
      const adjustedPassColors = await derivePassColors(adjusted, accentHex, logoBuffer)
      updateData.dominant_color = adjusted
      updateData.text_color = adjustedPassColors.foregroundColor
      updateData.label_color = adjustedPassColors.labelColor
    } else {
      updateData.dominant_color = passColors.backgroundColor
      updateData.text_color = passColors.foregroundColor
      updateData.label_color = passColors.labelColor
    }

    // ─── 5. AI CREATIVE CONTENT ─────────────────────────────
    // Only if we didn't already get it from full AI classification (step 1)

    if (!updateData.detected_reward) {
      try {
        const creative = await generateCreativeContent({
          business_name: lead.business_name,
          industry,
          city: lead.city,
          website_description: (updateData.website_description as string) || lead.website_description,
          gmaps_category: lead.gmaps_category,
          google_rating: lead.google_rating,
          google_reviews_count: lead.google_reviews_count,
          has_existing_loyalty: (updateData.has_existing_loyalty as boolean) ?? lead.has_existing_loyalty,
          has_app: (updateData.has_app as boolean) ?? lead.has_app,
          social_links: (updateData.social_links as Record<string, string>) || lead.social_links,
        })

        updateData.detected_reward = creative.detected_reward
        updateData.detected_reward_emoji = creative.detected_reward_emoji
        updateData.detected_stamp_emoji = creative.detected_stamp_emoji
        updateData.detected_pass_title = creative.detected_pass_title
        updateData.detected_max_stamps = creative.detected_max_stamps
        updateData.strip_prompt = creative.strip_prompt
        updateData.email_hooks = creative.email_hooks
        updateData.personalization_notes = creative.personalization_notes
      } catch (err) {
        console.error('Creative content generation failed (non-fatal):', err)
        // Use industry defaults
        if (industryDefaults) {
          updateData.detected_reward = industryDefaults.default_reward
          updateData.detected_reward_emoji = industryDefaults.emoji
          updateData.detected_stamp_emoji = industryDefaults.default_stamp_emoji
          updateData.detected_pass_title = 'Treuekarte'
          updateData.detected_max_stamps = industryDefaults.default_max_stamps
        }
      }
    }

    // ─── 6. FINALIZE ────────────────────────────────────────

    const updatedLead = { ...lead, ...updateData, enrichment_status: 'completed' }
    updateData.lead_score = calculateLeadScore(updatedLead)
    updateData.enrichment_status = 'completed'

    const { data: result, error: updateError } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      throw new Error(updateError.message)
    }

    return NextResponse.json(result)
  } catch (err) {
    await supabase.from('leads').update({ enrichment_status: 'failed' }).eq('id', id)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enrichment fehlgeschlagen' },
      { status: 500 }
    )
  }
}
