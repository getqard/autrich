/**
 * Scrape Cache — avoids duplicate API calls for same domain.
 *
 * Cache-Key: normalizeDomain() from domain-utils.ts
 * TTL: 30 days (normal), 7 days (errors), 14 days (instagram-only)
 * Storage: Logo + Screenshot → Supabase Storage "scrape-cache" bucket
 */

import { createServiceClient } from '@/lib/supabase/server'
import { normalizeDomain } from '@/lib/scraping/domain-utils'
import type { WebsiteScrapeCache } from '@/lib/supabase/types'

export type CachedScrapeData = {
  scrapeResult: Record<string, unknown>
  logoBuffer: Buffer | null
  logoSource: string | null
  screenshotBuffer: Buffer | null
  passColors: Record<string, unknown> | null
  cachedAt: string
  expiresAt: string
}

/**
 * Get cached scrape data for a domain.
 * Returns null if no cache or expired.
 */
export async function getCachedScrape(url: string): Promise<CachedScrapeData | null> {
  const domain = normalizeDomain(url)
  if (!domain) return null

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('website_scrape_cache')
    .select('*')
    .eq('normalized_domain', domain)
    .single()

  if (error || !data) return null

  const cache = data as WebsiteScrapeCache

  // Check expiry
  if (new Date(cache.expires_at) < new Date()) {
    // Expired — delete and return null
    await supabase.from('website_scrape_cache').delete().eq('id', cache.id)
    return null
  }

  // Fetch logo from storage if exists
  let logoBuffer: Buffer | null = null
  if (cache.logo_storage_path) {
    try {
      const { data: fileData } = await supabase.storage
        .from('scrape-cache')
        .download(cache.logo_storage_path)
      if (fileData) {
        logoBuffer = Buffer.from(await fileData.arrayBuffer())
      }
    } catch {
      // Non-fatal — logo might have been cleaned up
    }
  }

  // Fetch screenshot from storage if exists
  let screenshotBuffer: Buffer | null = null
  if (cache.screenshot_storage_path) {
    try {
      const { data: fileData } = await supabase.storage
        .from('scrape-cache')
        .download(cache.screenshot_storage_path)
      if (fileData) {
        screenshotBuffer = Buffer.from(await fileData.arrayBuffer())
      }
    } catch {
      // Non-fatal
    }
  }

  return {
    scrapeResult: cache.scrape_result as Record<string, unknown>,
    logoBuffer,
    logoSource: cache.logo_source,
    screenshotBuffer,
    passColors: cache.pass_colors as Record<string, unknown> | null,
    cachedAt: cache.created_at,
    expiresAt: cache.expires_at,
  }
}

/**
 * Store scrape data in cache.
 */
export async function setCachedScrape(
  url: string,
  data: {
    scrapeResult: Record<string, unknown>
    logoBuffer?: Buffer | null
    logoSource?: string | null
    screenshotBuffer?: Buffer | null
    passColors?: Record<string, unknown> | null
    httpStatus?: number | null
    error?: string | null
  }
): Promise<void> {
  const domain = normalizeDomain(url)
  if (!domain) return

  const supabase = createServiceClient()

  // Determine TTL based on result type
  const websiteType = data.scrapeResult?.websiteType as string | undefined
  const hasError = !!data.error
  let ttlDays = 30
  if (hasError) ttlDays = 7
  else if (websiteType === 'instagram-only' || websiteType === 'redirect-to-instagram') ttlDays = 14

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + ttlDays)

  // Upload logo to storage
  let logoStoragePath: string | null = null
  if (data.logoBuffer) {
    const path = `logos/${domain}.png`
    const { error } = await supabase.storage
      .from('scrape-cache')
      .upload(path, data.logoBuffer, {
        contentType: 'image/png',
        upsert: true,
      })
    if (!error) logoStoragePath = path
  }

  // Upload screenshot to storage
  let screenshotStoragePath: string | null = null
  if (data.screenshotBuffer) {
    const path = `screenshots/${domain}.png`
    const { error } = await supabase.storage
      .from('scrape-cache')
      .upload(path, data.screenshotBuffer, {
        contentType: 'image/png',
        upsert: true,
      })
    if (!error) screenshotStoragePath = path
  }

  // Upsert cache row
  await supabase
    .from('website_scrape_cache')
    .upsert({
      normalized_domain: domain,
      scrape_result: data.scrapeResult,
      logo_storage_path: logoStoragePath,
      logo_source: data.logoSource || null,
      screenshot_storage_path: screenshotStoragePath,
      pass_colors: data.passColors || null,
      http_status: data.httpStatus || null,
      scrape_error: data.error || null,
      expires_at: expiresAt.toISOString(),
    }, { onConflict: 'normalized_domain' })
}

/**
 * Invalidate cache for a domain — deletes DB row + storage files.
 */
export async function invalidateCache(url: string): Promise<void> {
  const domain = normalizeDomain(url)
  if (!domain) return

  const supabase = createServiceClient()

  // Get current cache to find storage paths
  const { data } = await supabase
    .from('website_scrape_cache')
    .select('logo_storage_path, screenshot_storage_path')
    .eq('normalized_domain', domain)
    .single()

  if (data) {
    // Delete storage files
    const filesToDelete: string[] = []
    if (data.logo_storage_path) filesToDelete.push(data.logo_storage_path)
    if (data.screenshot_storage_path) filesToDelete.push(data.screenshot_storage_path)

    if (filesToDelete.length > 0) {
      await supabase.storage.from('scrape-cache').remove(filesToDelete)
    }
  }

  // Delete cache row
  await supabase
    .from('website_scrape_cache')
    .delete()
    .eq('normalized_domain', domain)
}

/**
 * Get cache info for display (without downloading buffers).
 */
export async function getCacheInfo(url: string): Promise<{
  cached: boolean
  cachedAt: string | null
  expiresAt: string | null
  domain: string | null
} | null> {
  const domain = normalizeDomain(url)
  if (!domain) return null

  const supabase = createServiceClient()

  const { data } = await supabase
    .from('website_scrape_cache')
    .select('created_at, expires_at')
    .eq('normalized_domain', domain)
    .single()

  if (!data) return { cached: false, cachedAt: null, expiresAt: null, domain }

  const expired = new Date(data.expires_at) < new Date()
  return {
    cached: !expired,
    cachedAt: data.created_at,
    expiresAt: data.expires_at,
    domain,
  }
}
