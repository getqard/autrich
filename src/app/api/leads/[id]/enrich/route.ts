import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { scrapeWebsite } from '@/lib/enrichment/scraper'
import { captureWebsite } from '@/lib/enrichment/screenshot'
import { processLogo, validateLogoCandidate, fetchGoogleFavicon, generateInitialsLogo } from '@/lib/enrichment/logo'
import { pickBestLogo } from '@/lib/enrichment/logo-picker'
import { fetchInstagramAvatar } from '@/lib/enrichment/instagram'
import { fetchGmapsPhoto, cropToSquare } from '@/lib/enrichment/gmaps-photo'
import { classifyIndustry, classifyBusiness, generateCreativeContent } from '@/lib/ai/classifier'
import { calculateLeadScore } from '@/lib/enrichment/score'
import { determinePassColors } from '@/lib/enrichment/pass-colors'
import { getCachedScrape, setCachedScrape } from '@/lib/enrichment/scrape-cache'
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

    // ─── 2. WEBSITE SCRAPE (with cache) ────────────────────

    let scrapeResult: Record<string, unknown> | null = null
    let headerScreenshot: Buffer | null = null
    if (lead.website_url) {
      try {
        // Check cache first
        const cached = await getCachedScrape(lead.website_url)
        if (cached) {
          console.log(`[Enrich] Cache hit for ${lead.website_url}`)
          scrapeResult = cached.scrapeResult
          headerScreenshot = cached.screenshotBuffer

          updateData.website_description = scrapeResult.description
          updateData.social_links = scrapeResult.socialLinks
          updateData.structured_data = scrapeResult.structuredData
          updateData.has_existing_loyalty = scrapeResult.loyaltyDetected
          updateData.has_app = scrapeResult.appDetected

          if ((scrapeResult.socialLinks as Record<string, string>)?.instagram) {
            updateData.instagram_handle = (scrapeResult.socialLinks as Record<string, string>).instagram
          }
        } else {
          // Fresh scrape
          console.log(`[Enrich] Fresh scrape for ${lead.website_url}`)
          const freshResult = await scrapeWebsite(lead.website_url)
          scrapeResult = freshResult as unknown as Record<string, unknown>

          // Capture screenshot
          const isInstagramOnly = freshResult.websiteType === 'instagram-only' || freshResult.websiteType === 'redirect-to-instagram'
          if (!isInstagramOnly) {
            try {
              headerScreenshot = await captureWebsite(lead.website_url)
            } catch { /* non-fatal */ }
          }

          updateData.website_description = freshResult.description
          updateData.social_links = freshResult.socialLinks
          updateData.structured_data = freshResult.structuredData
          updateData.has_existing_loyalty = freshResult.loyaltyDetected
          updateData.has_app = freshResult.appDetected

          if (freshResult.socialLinks.instagram) {
            updateData.instagram_handle = freshResult.socialLinks.instagram
          }

          // Cache the result for other leads with same domain
          await setCachedScrape(lead.website_url, {
            scrapeResult: scrapeResult,
            screenshotBuffer: headerScreenshot,
          })
        }
      } catch (err) {
        console.error('Website scrape failed (non-fatal):', err)
      }
    }

    // ─── 3. LOGO WATERFALL ──────────────────────────────────

    let logoBuffer: Buffer | null = null
    let logoSource: string = 'generated'
    let domain: string | null = null
    if (lead.website_url) {
      try {
        const urlStr = lead.website_url.startsWith('http') ? lead.website_url : `https://${lead.website_url}`
        domain = new URL(urlStr).hostname.replace(/^www\./, '')
      } catch { /* invalid URL */ }
    }

    // 3b. Website Scraping Logo (with AI Picker)
    const logoCandidates = scrapeResult?.logoCandidates as Array<{ url: string; score: number; source: string; width: number | null; height: number | null }> | undefined

    if (!logoBuffer && logoCandidates?.length) {
      const sortedCandidates = [...logoCandidates]
        .sort((a, b) => b.score - a.score)

      // Try AI Logo Picker if we have multiple candidates
      let aiPickedUrl: string | null = null
      if (sortedCandidates.length >= 2) {
        try {
          // Cast to expected type — cached data may have simplified source strings
          const aiPick = await pickBestLogo(sortedCandidates as Parameters<typeof pickBestLogo>[0], lead.business_name)
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

    // 3c. Instagram Profilbild
    const igHandle = (updateData.instagram_handle as string) || lead.instagram_handle
    if (!logoBuffer && igHandle) {
      try {
        const igBuffer = await fetchInstagramAvatar(igHandle)
        if (igBuffer) {
          logoBuffer = igBuffer
          logoSource = 'instagram'
        }
      } catch (err) {
        console.error('Instagram avatar failed (non-fatal):', err)
      }
    }

    // 3d. GMaps Featured Image
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

    // 3e. Google Favicon
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

    // 3f. Generated Initials (never fails)
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

    // ─── 4. COLOR DETERMINATION (unified) ────────────────────

    // Fetch GMaps photo buffer for color extraction (if no logo found)
    let gmapsPhotoBuffer: Buffer | null = null
    if (lead.gmaps_photos?.length > 0) {
      try {
        const photo = await fetchGmapsPhoto(lead.gmaps_photos[0])
        if (photo) gmapsPhotoBuffer = photo
      } catch (err) {
        console.error('GMaps photo fetch failed (non-fatal):', err)
      }
    }

    const passColors = await determinePassColors({
      logoBuffer,
      cssCandidates: ((scrapeResult?.brandColors as Record<string, unknown>)?.candidates || []) as Parameters<typeof determinePassColors>[0]['cssCandidates'],
      headerBackground: (scrapeResult?.brandColors as Record<string, unknown>)?.headerBackground as string ?? null,
      headerScreenshot,
      websiteContext: {
        title: (scrapeResult?.title as string) ?? lead.business_name,
        description: (scrapeResult?.description as string) ?? lead.website_description,
        themeColor: (scrapeResult?.themeColor as string) ?? null,
      },
      industrySlug: industry,
      industryDefaults: industryDefaults ?? null,
      gmapsPhotoBuffer,
    })

    updateData.dominant_color = passColors.backgroundColor
    updateData.text_color = passColors.textColor
    updateData.label_color = passColors.labelColor
    if (passColors.accentColor) {
      updateData.accent_color = passColors.accentColor
    }

    // Store palette in extra_data
    if (passColors.palette) {
      const extra = (updateData.extra_data as Record<string, unknown>) || existingExtra
      updateData.extra_data = { ...extra, vibrant_swatches: passColors.palette.swatches, color_method: passColors.method }
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
