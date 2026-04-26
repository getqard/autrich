import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getTaskStatus, getTaskResults, abortTask, mapPlaceToRawResult } from '@/lib/scraping/gmaps-client'

async function getJob(jobId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase.from('scrape_jobs').select('*').eq('id', jobId).single()
  return data
}

function generateSlug(name: string, city?: string | null): string {
  const base = `${name} ${city || ''}`
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60)
  return `${base}-${Date.now().toString(36).slice(-4)}`
}

function normalizeName(value: string | null | undefined): string | null {
  const normalized = value?.toLowerCase().trim()
  return normalized || null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string; action: string[] }> }
) {
  const { jobId, action } = await params
  const act = action[0]
  const job = await getJob(jobId)
  if (!job) return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 })

  // ─── STATUS ───────────────────────────────────────────────
  if (act === 'status') {
    const supabase = createServiceClient()

    // Check if results already stored in DB
    const { count: storedCount } = await supabase
      .from('scrape_results_raw')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)

    const hasStoredResults = (storedCount || 0) > 0

    // If DB says completed and results are stored → done
    if (job.status === 'completed' && hasStoredResults) {
      return NextResponse.json({
        status: 'completed',
        needs_store: false,
        results_count: job.results_count || 0,
        started_at: job.started_at,
        completed_at: job.completed_at,
      })
    }

    if (job.status === 'failed' || job.status === 'cancelled') {
      return NextResponse.json({
        status: job.status,
        results_count: 0,
        error_message: job.error_message,
      })
    }

    if (!job.gmaps_task_id) {
      return NextResponse.json({ status: 'failed', error_message: 'No GMaps task ID' })
    }

    try {
      const taskStatus = await getTaskStatus(job.gmaps_task_id)

      if (taskStatus.status === 'completed') {
        // Update DB status
        await supabase.from('scrape_jobs').update({
          status: 'completed',
          results_count: taskStatus.result_count,
          completed_at: new Date().toISOString(),
        }).eq('id', jobId)

        // Tell frontend to store results
        return NextResponse.json({
          status: 'completed',
          needs_store: !hasStoredResults,
          results_count: taskStatus.result_count,
          started_at: job.started_at,
        })
      }

      if (taskStatus.status === 'failed') {
        await supabase.from('scrape_jobs').update({
          status: 'failed', error_message: 'GMaps task failed',
          completed_at: new Date().toISOString(),
        }).eq('id', jobId)
        return NextResponse.json({ status: 'failed', error_message: 'GMaps task failed' })
      }

      // Still running
      return NextResponse.json({
        status: 'running',
        results_count: taskStatus.result_count,
        preview_count: taskStatus.result_count,
        started_at: job.started_at,
      })
    } catch (err) {
      return NextResponse.json({
        status: 'error',
        error_message: err instanceof Error ? err.message : 'Status check failed',
      })
    }
  }

  // ─── RESULTS ──────────────────────────────────────────────
  if (act === 'results') {
    const supabase = createServiceClient()
    const { data: results } = await supabase
      .from('scrape_results_raw')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(500)

    const chainDomains = new Set<string>()
    const summary = (results || []).reduce((acc, result) => {
      const typed = result as Record<string, unknown>
      acc.total++
      if (typed.passes_filter) acc.passes_filter++
      if (typed.is_duplicate) acc.duplicates++
      if (typed.is_chain_duplicate) {
        acc.chain_duplicates++
        if (typeof typed.chain_domain === 'string' && typed.chain_domain) {
          chainDomains.add(typed.chain_domain)
        }
      }
      return acc
    }, {
      total: 0,
      passes_filter: 0,
      duplicates: 0,
      chain_duplicates: 0,
      chains_detected: 0,
    })

    summary.chains_detected = chainDomains.size

    return NextResponse.json({ results: results || [], count: results?.length || 0, summary })
  }

  return NextResponse.json({ error: `Unknown GET action: ${act}` }, { status: 400 })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; action: string[] }> }
) {
  const { jobId, action } = await params
  const act = action[0]
  const job = await getJob(jobId)
  if (!job) return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 })

  // ─── CANCEL ───────────────────────────────────────────────
  if (act === 'cancel') {
    if (job.gmaps_task_id) {
      try { await abortTask(job.gmaps_task_id) } catch { /* ok */ }
    }
    const supabase = createServiceClient()
    await supabase.from('scrape_jobs').update({
      status: 'cancelled', completed_at: new Date().toISOString(),
    }).eq('id', jobId)
    return NextResponse.json({ status: 'cancelled' })
  }

  // ─── STORE ────────────────────────────────────────────────
  if (act === 'store') {
    if (!job.gmaps_task_id) return NextResponse.json({ error: 'No GMaps task ID' }, { status: 400 })

    try {
      const { results } = await getTaskResults(job.gmaps_task_id)
      const supabase = createServiceClient()
      const rawResults = results.map((place: Record<string, unknown>) => mapPlaceToRawResult(place, jobId))

      if (rawResults.length > 0) {
        const { error: insertErr } = await supabase.from('scrape_results_raw').insert(rawResults)
        if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }

      await supabase.from('scrape_jobs').update({
        status: 'completed', results_count: rawResults.length,
      }).eq('id', jobId)

      return NextResponse.json({ stored: rawResults.length, status: 'completed' })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
    }
  }

  // ─── IMPORT ───────────────────────────────────────────────
  if (act === 'import') {
    const supabase = createServiceClient()
    let body: Record<string, unknown> = {}
    try { body = await request.json() } catch { /* no body */ }
    const campaignId = body.campaign_id as string | undefined
    const selectedIds = Array.isArray(body.result_ids)
      ? new Set((body.result_ids as string[]).filter(Boolean))
      : null

    const { data: rawResults } = await supabase
      .from('scrape_results_raw').select('*').eq('job_id', jobId)

    if (!rawResults?.length) {
      return NextResponse.json({ error: 'Keine Ergebnisse' }, { status: 400 })
    }

    const resultsToImport = selectedIds
      ? rawResults.filter((result) => selectedIds.has(result.id))
      : rawResults

    if (resultsToImport.length === 0) {
      return NextResponse.json({ error: 'Keine ausgewählten Ergebnisse gefunden' }, { status: 400 })
    }

    // Dedup: load existing emails + normalized business names + place IDs
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('email, business_name, extra_data')
    const existingEmails = new Set(
      (existingLeads || []).map(l => l.email?.toLowerCase()).filter(Boolean)
    )
    const existingNames = new Set(
      (existingLeads || []).map(l => normalizeName(l.business_name)).filter(Boolean)
    )
    const existingPlaceIds = new Set(
      (existingLeads || [])
        .map((lead) => {
          const extra = (lead.extra_data || {}) as Record<string, unknown>
          return typeof extra.gmaps_place_id === 'string' ? extra.gmaps_place_id : null
        })
        .filter(Boolean)
    )
    // Track names within this batch too (franchise dedup)
    const batchNames = new Set<string>()
    const batchPlaceIds = new Set<string>()

    let imported = 0
    let importedWithoutEmail = 0
    let skipped = 0
    let skippedDuplicates = 0
    let skippedMissingContact = 0
    const errors: string[] = []

    for (const raw of resultsToImport) {
      try {
        const data = (raw.raw_data || {}) as Record<string, unknown>
        const enrichment = (data.enrichment || {}) as Record<string, unknown>
        const normalizedName = normalizeName(raw.name || 'Unknown') || 'unknown'
        const placeId = typeof raw.place_id === 'string' ? raw.place_id : null
        const email = (enrichment.recommended_email as string) || raw.email || null

        const lead = {
          campaign_id: campaignId || null,
          business_name: raw.name || 'Unknown',
          website_url: raw.website || null,
          email,
          phone: raw.phone || null,
          city: raw.city || null,
          address: raw.address || null,
          industry: raw.category || null,
          google_rating: raw.rating || null,
          google_reviews_count: raw.reviews_count || null,
          social_links: raw.social_links || {},
          opening_hours: raw.opening_hours || null,
          personalization_notes: (enrichment.sales_summary as string) || null,
          extra_data: {
            gmaps_place_id: raw.place_id,
            gmaps_category: raw.category,
            gmaps_categories: raw.categories,
            lat: raw.lat, lng: raw.lng,
            enrichment,
          },
          download_page_slug: generateSlug(raw.name || 'business', raw.city),
          pipeline_status: 'new',
          enrichment_status: 'pending',
          pass_status: 'pending',
          email_status: 'pending',
          source: 'scraping',
          triage_status: 'pending',
          enrichment_review_status: 'pending',
        }

        // Ohne Website, Email und Telefon ist der Lead im aktuellen Flow nicht brauchbar.
        if (!lead.website_url && !lead.email && !lead.phone) {
          skipped++
          skippedMissingContact++
          continue
        }

        // Dedup: skip if email already exists
        if (lead.email && existingEmails.has(lead.email.toLowerCase())) {
          skipped++
          skippedDuplicates++
          continue
        }

        if (placeId && (existingPlaceIds.has(placeId) || batchPlaceIds.has(placeId))) {
          skipped++
          skippedDuplicates++
          continue
        }

        // Dedup: skip if exact same business name already exists (franchise/chain)
        if (existingNames.has(normalizedName) || batchNames.has(normalizedName)) {
          skipped++
          skippedDuplicates++
          continue
        }

        // Track for batch dedup
        if (lead.email) {
          existingEmails.add(lead.email.toLowerCase())
        }
        batchNames.add(normalizedName)
        if (placeId) {
          existingPlaceIds.add(placeId)
          batchPlaceIds.add(placeId)
        }

        const { error: insertErr } = await supabase.from('leads').insert(lead)
        if (insertErr) {
          if (insertErr.message.includes('duplicate')) {
            skipped++
            skippedDuplicates++
            continue
          }
          errors.push(`${raw.name}: ${insertErr.message}`)
          continue
        }
        imported++
        if (!lead.email) {
          importedWithoutEmail++
        }
      } catch (err) {
        errors.push(`${raw.name}: ${err instanceof Error ? err.message : 'Unknown'}`)
      }
    }

    await supabase.from('scrape_jobs').update({ imported_count: imported }).eq('id', jobId)
    return NextResponse.json({
      imported,
      imported_without_email: importedWithoutEmail,
      skipped,
      skipped_duplicates: skippedDuplicates,
      skipped_missing_contact: skippedMissingContact,
      duplicates: skippedDuplicates,
      errors,
      total: resultsToImport.length,
    })
  }

  return NextResponse.json({ error: `Unknown POST action: ${act}` }, { status: 400 })
}
