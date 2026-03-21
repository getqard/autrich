/**
 * Franchise Detection & Email Dedup
 *
 * Detects franchise emails (same email, multiple locations) and generic
 * emails (info@, kontakt@, etc.) to prevent sending duplicates.
 */

import { createServiceClient } from '@/lib/supabase/server'

const GENERIC_PREFIXES = [
  'info', 'kontakt', 'contact', 'office', 'hello', 'hallo',
  'mail', 'post', 'zentrale', 'service', 'support', 'team', 'anfrage',
  'buchung', 'reservierung', 'bestellung', 'order', 'shop',
]

/**
 * Check if an email address is a generic/catchall address.
 */
export function isGenericEmail(email: string): boolean {
  const prefix = email.split('@')[0].toLowerCase()
  return GENERIC_PREFIXES.includes(prefix)
}

/**
 * Register an email in the global email_contacts table.
 * Returns franchise info if email already exists.
 */
export async function registerEmailContact(
  email: string,
  leadId: string,
  leadScore: number = 50,
): Promise<{
  isNew: boolean
  isFranchise: boolean
  isBlacklisted: boolean
  isGeneric: boolean
  existingLeadCount: number
  primaryLeadId: string | null
}> {
  const emailLower = email.toLowerCase()
  const domain = emailLower.split('@')[1]
  const generic = isGenericEmail(emailLower)

  const supabase = createServiceClient()

  // Check if email already exists
  const { data: existing } = await supabase
    .from('email_contacts')
    .select('*')
    .eq('email', emailLower)
    .single()

  if (existing) {
    // Email exists — update franchise count
    const newCount = existing.franchise_lead_count + 1
    const isFranchise = newCount >= 2

    // Decide new primary: keep existing if score is higher
    let primaryLeadId = existing.primary_lead_id
    if (!primaryLeadId) {
      primaryLeadId = leadId
    }
    // We'll update primary based on score if needed (caller can handle this)

    await supabase
      .from('email_contacts')
      .update({
        franchise_lead_count: newCount,
        is_franchise_email: isFranchise,
      })
      .eq('id', existing.id)

    return {
      isNew: false,
      isFranchise,
      isBlacklisted: existing.is_blacklisted,
      isGeneric: existing.is_generic,
      existingLeadCount: newCount,
      primaryLeadId,
    }
  }

  // New email — register it (upsert to handle race condition)
  await supabase
    .from('email_contacts')
    .upsert({
      email: emailLower,
      email_domain: domain,
      is_generic: generic,
      primary_lead_id: leadId,
      franchise_lead_count: 1,
    }, { onConflict: 'email' })

  return {
    isNew: true,
    isFranchise: false,
    isBlacklisted: false,
    isGeneric: generic,
    existingLeadCount: 1,
    primaryLeadId: leadId,
  }
}

/**
 * Check multiple emails against email_contacts for batch import.
 * Returns a map of email → status.
 */
export async function checkEmailsBatch(
  emails: string[]
): Promise<Map<string, {
  exists: boolean
  isFranchise: boolean
  isBlacklisted: boolean
  isGeneric: boolean
  franchiseCount: number
  primaryLeadId: string | null
}>> {
  const supabase = createServiceClient()
  const normalized = emails.map(e => e.toLowerCase())

  const { data: contacts } = await supabase
    .from('email_contacts')
    .select('*')
    .in('email', normalized)

  const result = new Map<string, {
    exists: boolean
    isFranchise: boolean
    isBlacklisted: boolean
    isGeneric: boolean
    franchiseCount: number
    primaryLeadId: string | null
  }>()

  // Initialize all as not found
  for (const email of normalized) {
    result.set(email, {
      exists: false,
      isFranchise: false,
      isBlacklisted: false,
      isGeneric: isGenericEmail(email),
      franchiseCount: 0,
      primaryLeadId: null,
    })
  }

  // Fill in existing contacts
  if (contacts) {
    for (const contact of contacts) {
      result.set(contact.email, {
        exists: true,
        isFranchise: contact.is_franchise_email,
        isBlacklisted: contact.is_blacklisted,
        isGeneric: contact.is_generic,
        franchiseCount: contact.franchise_lead_count,
        primaryLeadId: contact.primary_lead_id,
      })
    }
  }

  return result
}

/**
 * Detect franchises in a batch of leads (same email, different addresses).
 * Returns emails that appear 2+ times with different addresses.
 */
export function detectFranchisesInBatch(
  leads: Array<{ email: string; address?: string | null; business_name: string }>
): Map<string, { count: number; locations: string[] }> {
  const emailGroups = new Map<string, Array<{ address: string | null; name: string }>>()

  for (const lead of leads) {
    const email = lead.email.toLowerCase()
    const group = emailGroups.get(email) || []
    group.push({ address: lead.address || null, name: lead.business_name })
    emailGroups.set(email, group)
  }

  const franchises = new Map<string, { count: number; locations: string[] }>()
  for (const [email, group] of emailGroups) {
    if (group.length >= 2) {
      franchises.set(email, {
        count: group.length,
        locations: group.map(g => g.name + (g.address ? ` (${g.address})` : '')),
      })
    }
  }

  return franchises
}

/**
 * Get franchise info for a single lead's email.
 */
export async function getFranchiseInfo(email: string): Promise<{
  isFranchise: boolean
  franchiseCount: number
  isGeneric: boolean
  isBlacklisted: boolean
  primaryLeadId: string | null
} | null> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('email_contacts')
    .select('*')
    .eq('email', email.toLowerCase())
    .single()

  if (!data) return null

  return {
    isFranchise: data.is_franchise_email,
    franchiseCount: data.franchise_lead_count,
    isGeneric: data.is_generic,
    isBlacklisted: data.is_blacklisted,
    primaryLeadId: data.primary_lead_id,
  }
}
