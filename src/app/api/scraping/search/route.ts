import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createScrapeTask } from '@/lib/scraping/gmaps-client'
import { buildCityCode } from '@/lib/scraping/city-codes'
import type { QualityFilter } from '@/lib/supabase/types'

// POST /api/scraping/search — Start a manual scrape job
export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    industry_id,
    industry_slug,
    custom_business_type,
    city,
    bundesland,
    city_id,
    max_results,
    extraction_method,
    quality_filter,
    auto_import,
    enable_enrichment,
  } = body as {
    industry_id?: string
    industry_slug?: string
    custom_business_type?: string
    city: string
    bundesland?: string
    city_id?: string
    max_results?: number
    extraction_method?: string
    quality_filter?: QualityFilter
    auto_import?: boolean
    enable_enrichment?: boolean
  }

  if (!city) {
    return NextResponse.json({ error: 'Stadt oder PLZ ist erforderlich' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Detect bulk PLZ input: comma/newline separated numbers (4-5 digits)
  const plzPattern = /^\d{4,5}$/
  const inputParts = city.split(/[,;\n\r]+/).map(s => s.trim()).filter(Boolean)
  const isBulkPlz = inputParts.length > 1 && inputParts.every(p => plzPattern.test(p))
  const bulkPlzList = isBulkPlz ? inputParts : []

  // Get industry info if provided
  let industrySearchTerm = ''
  let gmapsCategory = ''
  let resolvedIndustryId = industry_id || null
  if (industry_id) {
    const { data: industry } = await supabase
      .from('industries')
      .select('slug, name, search_terms, gmaps_category')
      .eq('id', industry_id)
      .single()
    if (industry) {
      industrySearchTerm = (industry.search_terms as string[])?.[0] || industry.slug
      gmapsCategory = industry.gmaps_category || ''
    }
  } else if (industry_slug) {
    const { data: industry } = await supabase
      .from('industries')
      .select('id, slug, name, search_terms, gmaps_category')
      .eq('slug', industry_slug)
      .single()
    if (industry) {
      industrySearchTerm = (industry.search_terms as string[])?.[0] || industry.slug
      gmapsCategory = industry.gmaps_category || ''
      resolvedIndustryId = industry.id
    }
  }

  const searchTerm = industrySearchTerm || custom_business_type || ''

  // Build search links for bulk PLZ mode
  let bulkSearchLinks: string[] = []
  let searchQuery: string
  let cityCode: string | null = null
  let businessType: string | undefined

  if (isBulkPlz) {
    // Bulk PLZ mode: one search link per PLZ
    bulkSearchLinks = bulkPlzList.map(plz => {
      const q = searchTerm ? `${searchTerm} ${plz}` : plz
      return `https://www.google.com/maps/search/${encodeURIComponent(q)}`
    })
    searchQuery = `${searchTerm} [${bulkPlzList.length} PLZ: ${bulkPlzList.slice(0, 5).join(', ')}${bulkPlzList.length > 5 ? '...' : ''}]`
    businessType = undefined // link-based search doesn't use business_types
  } else {
    // Single city mode (existing behavior)
    let resolvedBundesland = bundesland || ''
    if (!resolvedBundesland && city_id) {
      const { data: cityData } = await supabase
        .from('cities')
        .select('bundesland')
        .eq('id', city_id)
        .single()
      if (cityData) resolvedBundesland = cityData.bundesland
    }

    if (!resolvedBundesland) {
      const { data: cityData } = await supabase
        .from('cities')
        .select('bundesland')
        .ilike('name', city.trim())
        .limit(1)
        .single()
      if (cityData) resolvedBundesland = cityData.bundesland
    }

    cityCode = resolvedBundesland ? buildCityCode(city.trim(), resolvedBundesland) : null
    searchQuery = searchTerm ? `${searchTerm} ${city}` : city
    businessType = gmapsCategory || custom_business_type || undefined
  }

  // Create scrape job in DB
  const { data: job, error: jobError } = await supabase
    .from('scrape_jobs')
    .insert({
      plan_id: null,
      industry_id: resolvedIndustryId,
      city_id: city_id || null,
      search_query: searchQuery,
      status: 'running',
      quality_filter: quality_filter || {},
      auto_import: auto_import || false,
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message || 'Job konnte nicht erstellt werden' }, { status: 500 })
  }

  // Start GMaps scrape task
  try {
    const { taskId } = await createScrapeTask({
      searchQuery,
      searchLinks: bulkSearchLinks.length > 0 ? bulkSearchLinks : undefined,
      businessType,
      cityCode: cityCode || undefined,
      maxResults: max_results || null,
      extractionMethod: extraction_method || 'fast',
      enableEnrichment: enable_enrichment || false,
    })

    // Store the gmaps task ID as a proper column
    await supabase
      .from('scrape_jobs')
      .update({ gmaps_task_id: taskId })
      .eq('id', job.id)

    return NextResponse.json({
      job_id: job.id,
      gmaps_task_id: taskId,
      started_at: job.started_at,
      search_query: searchQuery,
      city_code: cityCode,
      search_method: isBulkPlz ? 'bulk_plz' : (cityCode ? 'city' : 'links'),
      bulk_plz_count: bulkPlzList.length || undefined,
      status: 'running',
    })
  } catch (e) {
    await supabase
      .from('scrape_jobs')
      .update({
        status: 'failed',
        error_message: e instanceof Error ? e.message : 'Unbekannter Fehler',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    return NextResponse.json({
      error: e instanceof Error ? e.message : 'GMaps API Fehler',
    }, { status: 500 })
  }
}
