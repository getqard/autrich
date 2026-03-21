import type { ScrapeResultRawInsert, QualityFilter } from '@/lib/supabase/types'
import { normalizeDomain } from '@/lib/scraping/domain-utils'

// ============================================
// Google Maps Extractor API Client
// Direct HTTP calls to Botasaurus Desktop API
// ============================================

const GMAPS_API_URL = process.env.GMAPS_API_URL || 'http://localhost:3000'
const OMKAR_API_KEY = process.env.OMKAR_API_KEY || ''

// --- Endpoints (discovered via HTTP interception) ---
// GET  /tasks?with_results=false&page=X&per_page=X  — list tasks
// POST /tasks/create-task-async                      — create async task
// GET  /tasks/:id                                    — get task
// POST /tasks/:id/results                            — get results
// POST /tasks/:id/abort                              — abort task
// DELETE /tasks/:id                                  — delete task
// POST /tasks/bulk-abort                             — bulk abort
// POST /tasks/bulk-delete                            — bulk delete

// --- Retry Logic ---

class GmapsApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
    this.name = 'GmapsApiError'
  }

  get isRetryable(): boolean {
    return this.statusCode >= 500 || this.statusCode === 429
  }
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, baseDelayMs = 1000): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      // Don't retry client errors (4xx except 429)
      if (e instanceof GmapsApiError && !e.isRetryable) {
        throw e
      }
      // Don't retry on last attempt
      if (attempt === maxRetries) break
      // Exponential backoff: 1s, 2s
      const delay = baseDelayMs * (attempt + 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

async function gmapsFetch(path: string, opts: RequestInit = {}) {
  let res: Response
  try {
    res = await fetch(`${GMAPS_API_URL}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts.headers },
    })
  } catch (e) {
    // Network error (server unreachable, DNS failure, etc.)
    throw new GmapsApiError(0, `Botasaurus nicht erreichbar: ${e instanceof Error ? e.message : 'Network Error'}`)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new GmapsApiError(res.status, `GMaps API ${res.status}: ${text}`)
  }
  return res.json()
}

// --- Types ---

export type GmapsPlace = {
  place_id?: string
  name?: string
  description?: string
  address?: string
  detailed_address?: {
    city?: string
    postal_code?: string
    state?: string
    country?: string
  }
  phone?: string
  website?: string
  emails?: string[]
  rating?: number
  reviews?: number
  main_category?: string
  categories?: string[]
  latitude?: number
  longitude?: number
  featured_image?: string
  owner_name?: string
  is_spending_on_ads?: boolean
  can_claim?: boolean
  is_temporarily_closed?: boolean
  workday_timing?: string
  link?: string
  query?: string
  linkedin?: string
  twitter?: string
  facebook?: string
  youtube?: string
  instagram?: string
  tiktok?: string
  [key: string]: unknown
}

// --- Public API ---

export async function createScrapeTask(opts: {
  searchQuery: string
  searchLinks?: string[]
  businessType?: string
  cityCode?: string
  maxResults?: number | null
  extractionMethod?: string
  lang?: string
  enableEnrichment?: boolean
}): Promise<{ taskId: number }> {
  const {
    searchQuery,
    searchLinks,
    businessType,
    cityCode,
    maxResults = null,
    extractionMethod = 'fast',
    lang = 'de',
    enableEnrichment = false,
  } = opts

  // Priority: 1) Multiple search links (bulk PLZ), 2) City code, 3) Single link
  const useBulkLinks = searchLinks && searchLinks.length > 0
  const useCity = !useBulkLinks && !!cityCode
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`

  const data = {
    business_types: useCity && businessType ? [businessType] : [],
    search_method: useBulkLinks ? 'links' : (useCity ? 'city' : 'links'),
    countries: [],
    states: [],
    cities: useCity && cityCode ? [cityCode] : [],
    randomize_cities: false,
    include_places_outside_city: true,
    search_links: useBulkLinks ? searchLinks : (useCity ? [] : [searchUrl]),
    extraction_method: extractionMethod,
    geo_shape: 'polygons',
    point_coordinates: '',
    polygons: null,
    geo_zoom_level: '16',
    exclude_outside_shape: true,
    api_key: enableEnrichment ? OMKAR_API_KEY : '',
    product_description: enableEnrichment ? 'Digital loyalty cards (stamp cards) for Apple Wallet and Google Wallet. Helps local businesses retain customers with a modern, paperless loyalty program.' : '',
    enable_emails_social: enableEnrichment,
    recommended_emails_count: enableEnrichment ? '1' : 'none',
    verify_recommended_emails: false,
    enable_sales_summary: enableEnrichment,
    enable_phone_info: false,
    enrichment_filters: [],
    filter_reviews_gt: null,
    filter_reviews_lt: null,
    filter_category_contains: '',
    enable_reviews_extraction: false,
    max_reviews: 20,
    reviews_sort: 'newest',
    reviews_query: '',
    enable_photos_extraction: false,
    max_photos: 5,
    lang,
    max_results: maxResults,
  }

  return withRetry(async () => {
    const result = await gmapsFetch('/tasks/create-task-async', {
      method: 'POST',
      body: JSON.stringify({ scraper_name: 'google_maps_scraper', data }),
    })

    // Returns array of tasks — first is "All Task"
    const tasks = Array.isArray(result) ? result : [result]
    const taskId = tasks[0]?.id
    if (!taskId) throw new Error('Keine Task-ID in API-Response erhalten')
    return { taskId }
  })
}

export async function getTaskStatus(taskId: number): Promise<{
  id: number
  status: string
  result_count: number
}> {
  return withRetry(async () => {
    const task = await gmapsFetch(`/tasks/${taskId}`)
    return {
      id: task.id,
      status: task.status,
      result_count: task.result_count || 0,
    }
  })
}

export async function getTaskResults(taskId: number): Promise<{
  results: GmapsPlace[]
  totalCount: number
}> {
  return withRetry(async () => {
    // Fetch ALL results — set per_page high to avoid pagination
    const response = await gmapsFetch(`/tasks/${taskId}/results`, {
      method: 'POST',
      body: JSON.stringify({ per_page: 10000 }),
    })

    // API returns either:
    //   1. Array directly: GmapsPlace[]
    //   2. Object: { results: GmapsPlace[], count: N, total_pages: N }
    // Handle both, and check for error field
    if (response?.error) {
      throw new Error(`GMaps Results Error: ${response.error}`)
    }

    const rawResults: GmapsPlace[] = Array.isArray(response)
      ? response
      : (response?.results || [])

    // Deduplicate by place_id — API often returns each place multiple times
    const seen = new Set<string>()
    const results: GmapsPlace[] = []
    for (const place of rawResults) {
      const key = place.place_id || `${place.name}|${place.address}`
      if (!key || key === 'undefined|undefined') {
        results.push(place)
        continue
      }
      if (seen.has(key)) continue
      seen.add(key)
      results.push(place)
    }

    const totalCount = response?.count || results.length

    return { results, totalCount }
  })
}

export async function abortTask(taskId: number): Promise<void> {
  try {
    await gmapsFetch(`/tasks/${taskId}/abort`, { method: 'POST', body: '{}' })
  } catch {
    // Abort is best-effort — task may already be finished or deleted
  }
}

export async function deleteTask(taskId: number): Promise<void> {
  await gmapsFetch(`/tasks/${taskId}`, { method: 'DELETE' })
}

export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    await gmapsFetch('/tasks?with_results=false&page=1&per_page=1')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Connection failed' }
  }
}

// --- Data Mapping ---

export function mapPlaceToRawResult(
  place: GmapsPlace,
  jobId: string,
  qualityFilter?: QualityFilter
): ScrapeResultRawInsert {
  const passesFilter = checkQualityFilter(place, qualityFilter)

  const email = place.emails && place.emails.length > 0 ? place.emails[0] : null

  const socialLinks: Record<string, string> = {}
  if (place.linkedin) socialLinks.linkedin = place.linkedin
  if (place.twitter) socialLinks.twitter = place.twitter
  if (place.facebook) socialLinks.facebook = place.facebook
  if (place.youtube) socialLinks.youtube = place.youtube
  if (place.instagram) socialLinks.instagram = place.instagram
  if (place.tiktok) socialLinks.tiktok = place.tiktok

  return {
    job_id: jobId,
    gmaps_place_id: place.place_id || null,
    name: place.name || 'Unknown',
    address: place.address || null,
    city: place.detailed_address?.city || null,
    postal_code: place.detailed_address?.postal_code || null,
    bundesland: place.detailed_address?.state || null,
    phone: place.phone || null,
    website: place.website || null,
    email,
    rating: place.rating ?? null,
    reviews_count: place.reviews ?? 0,
    category: place.main_category || null,
    categories: place.categories || [],
    lat: place.latitude ?? null,
    lng: place.longitude ?? null,
    photos: place.featured_image ? [place.featured_image] : [],
    opening_hours: place.workday_timing ? { raw: place.workday_timing } : null,
    social_links: socialLinks,
    raw_data: JSON.parse(JSON.stringify(place)),
    imported: false,
    passes_filter: passesFilter,
    normalized_domain: normalizeDomain(place.website),
  }
}

function checkQualityFilter(place: GmapsPlace, filter?: QualityFilter): boolean {
  if (!filter) return true
  if (filter.min_rating && (place.rating ?? 0) < filter.min_rating) return false
  if (filter.min_reviews && (place.reviews ?? 0) < filter.min_reviews) return false
  if (filter.has_website && !place.website) return false
  if (filter.has_phone && !place.phone) return false
  return true
}
