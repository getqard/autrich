/**
 * A/B Group Assignment — Counter-based Equal Distribution
 *
 * Assigns one of the 5 email strategies to a lead, balancing the
 * distribution across all leads of the same campaign that already
 * carry an ab_group (regardless of their downstream status).
 *
 * Counter-based instead of pure-random because random sampling at
 * small N (< ~50) regularly produces uneven groups. Counter guarantees
 * balanced groups from the very first lead.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EmailStrategy } from '@/lib/supabase/types'

export const AB_STRATEGIES: EmailStrategy[] = [
  'curiosity',
  'social_proof',
  'direct',
  'storytelling',
  'provocation',
]

export type ABAssignmentResult = {
  strategy: EmailStrategy
  counts: Record<EmailStrategy, number>
  source: 'counter' | 'existing'
}

export async function assignABGroup(
  campaignId: string,
  supabase: SupabaseClient,
): Promise<ABAssignmentResult> {
  const { data: existing, error } = await supabase
    .from('leads')
    .select('ab_group')
    .eq('campaign_id', campaignId)
    .not('ab_group', 'is', null)

  if (error) {
    throw new Error(`A/B count query failed: ${error.message}`)
  }

  const counts: Record<EmailStrategy, number> = {
    curiosity: 0,
    social_proof: 0,
    direct: 0,
    storytelling: 0,
    provocation: 0,
  }
  for (const row of existing || []) {
    const g = (row as { ab_group: EmailStrategy | null }).ab_group
    if (g && g in counts) counts[g] += 1
  }

  // Find minimum count, then random tiebreaker among strategies with that count
  const minCount = Math.min(...AB_STRATEGIES.map(s => counts[s]))
  const candidates = AB_STRATEGIES.filter(s => counts[s] === minCount)
  const strategy = candidates[Math.floor(Math.random() * candidates.length)]

  return { strategy, counts, source: 'counter' }
}
