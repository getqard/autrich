import type { ScrapeResultRawInsert } from '@/lib/supabase/types'

// ============================================
// Domain Normalization & Chain Detection
// Pure functions, no external dependencies
// ============================================

/**
 * Normalize a website URL to its root domain.
 * "https://www.der-beck.de/filialen?page=2" → "der-beck.de"
 * "http://doener-palace.de/" → "doener-palace.de"
 */
export function normalizeDomain(url: string | null | undefined): string | null {
  if (!url || url.trim() === '') return null

  try {
    // Add protocol if missing so URL constructor works
    let normalized = url.trim()
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized
    }

    const parsed = new URL(normalized)
    let hostname = parsed.hostname.toLowerCase()

    // Strip "www."
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4)
    }

    // Skip social media / platform domains — these aren't real business websites
    const platformDomains = [
      'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com',
      'twitter.com', 'x.com', 'linkedin.com', 'yelp.com',
      'tripadvisor.com', 'google.com', 'maps.google.com',
      'canva.site', 'wix.com', 'jimdo.com',
    ]
    if (platformDomains.some(d => hostname === d || hostname.endsWith('.' + d))) {
      return null
    }

    return hostname || null
  } catch {
    return null
  }
}

/**
 * Detect chain businesses (same website, multiple locations).
 * Returns a Map of domain → results[], only for domains with 2+ entries.
 * Within each group, results are sorted by reviews_count DESC (best first).
 */
export function detectChains(
  results: ScrapeResultRawInsert[]
): Map<string, ScrapeResultRawInsert[]> {
  // Group by normalized_domain
  const domainGroups = new Map<string, ScrapeResultRawInsert[]>()

  for (const result of results) {
    const domain = result.normalized_domain
    if (!domain) continue

    const group = domainGroups.get(domain)
    if (group) {
      group.push(result)
    } else {
      domainGroups.set(domain, [result])
    }
  }

  // Keep only groups with 2+ entries (actual chains)
  const chains = new Map<string, ScrapeResultRawInsert[]>()
  for (const [domain, group] of domainGroups) {
    if (group.length >= 2) {
      // Sort by reviews_count DESC — best location first
      group.sort((a, b) => (b.reviews_count ?? 0) - (a.reviews_count ?? 0))
      chains.set(domain, group)
    }
  }

  return chains
}

/**
 * Mark chain duplicates in a results array.
 * For each chain: keeps the first entry (most reviews) as-is,
 * marks the rest with _chain_duplicate in raw_data and sets passes_filter = false.
 * Returns the total number of chain duplicates marked.
 */
export function markChainDuplicates(results: ScrapeResultRawInsert[]): number {
  const chains = detectChains(results)
  let markedCount = 0

  for (const [domain, group] of chains) {
    const keptResult = group[0]
    const keptName = keptResult.name || 'Unknown'

    // Skip the first (best) — mark all others as chain duplicates
    for (let i = 1; i < group.length; i++) {
      const dup = group[i]
      dup.passes_filter = false
      dup.raw_data = {
        ...(dup.raw_data as Record<string, unknown> || {}),
        _chain_duplicate: true,
        _chain_domain: domain,
        _chain_kept_name: keptName,
        _chain_size: group.length,
      }
      markedCount++
    }
  }

  return markedCount
}
