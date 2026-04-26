import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Schreibt die Email eines Leads in die `blacklist`-Tabelle (UPSERT auf email).
 *
 * Damit wird der Lead bei künftigen Scrapes (über die Email-Dedup-Schiene) und
 * bei künftigen CSV-Uploads (existierender Check in upload/route.ts) abgewiesen.
 *
 * Aufgerufen aus den Reject-Branches von triage-action, enrichment-review-action,
 * review-action — sowie aus DELETE /api/leads/[id]?blacklist=true.
 */
export async function addLeadEmailToBlacklist(
  supabase: SupabaseClient,
  leadId: string,
  reason: string,
): Promise<{ blacklisted: boolean; email: string | null }> {
  const { data: lead } = await supabase
    .from('leads')
    .select('email')
    .eq('id', leadId)
    .single()

  const email = lead?.email || null
  if (!email) return { blacklisted: false, email: null }

  await supabase
    .from('blacklist')
    .upsert({ email, reason }, { onConflict: 'email' })

  return { blacklisted: true, email }
}
