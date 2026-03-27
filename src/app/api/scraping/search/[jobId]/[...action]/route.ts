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
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return NextResponse.json({
        status: job.status,
        results_count: job.results_count || 0,
        started_at: job.started_at,
        completed_at: job.completed_at,
        error_message: job.error_message,
      })
    }

    if (!job.gmaps_task_id) {
      return NextResponse.json({ status: 'failed', error_message: 'No GMaps task ID' })
    }

    try {
      const taskStatus = await getTaskStatus(job.gmaps_task_id)
      const supabase = createServiceClient()

      if (taskStatus.status === 'completed') {
        await supabase.from('scrape_jobs').update({
          status: 'completed',
          results_count: taskStatus.result_count,
          completed_at: new Date().toISOString(),
        }).eq('id', jobId)
      }

      return NextResponse.json({
        status: taskStatus.status === 'completed' ? 'completed' :
               taskStatus.status === 'failed' ? 'failed' : 'running',
        results_count: taskStatus.result_count,
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

    return NextResponse.json({ results: results || [], count: results?.length || 0 })
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

    const { data: rawResults } = await supabase
      .from('scrape_results_raw').select('*').eq('job_id', jobId)

    if (!rawResults?.length) {
      return NextResponse.json({ error: 'Keine Ergebnisse' }, { status: 400 })
    }

    let imported = 0, skipped = 0
    const errors: string[] = []

    for (const raw of rawResults) {
      try {
        const data = (raw.raw_data || {}) as Record<string, unknown>
        const enrichment = (data.enrichment || {}) as Record<string, unknown>

        const lead = {
          campaign_id: campaignId || null,
          business_name: raw.name || 'Unknown',
          website_url: raw.website || null,
          email: (enrichment.recommended_email as string) || raw.email || null,
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
        }

        if (!lead.email) { skipped++; continue }

        const { error: insertErr } = await supabase.from('leads').insert(lead)
        if (insertErr) {
          if (insertErr.message.includes('duplicate')) { skipped++; continue }
          errors.push(`${raw.name}: ${insertErr.message}`)
          continue
        }
        imported++
      } catch (err) {
        errors.push(`${raw.name}: ${err instanceof Error ? err.message : 'Unknown'}`)
      }
    }

    await supabase.from('scrape_jobs').update({ imported_count: imported }).eq('id', jobId)
    return NextResponse.json({ imported, skipped, errors, total: rawResults.length })
  }

  return NextResponse.json({ error: `Unknown POST action: ${act}` }, { status: 400 })
}
