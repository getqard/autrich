/**
 * Batch Enrichment — Child Job
 *
 * Enriches a single lead. Same logic as /api/leads/[id]/enrich
 * but reads website data from cache instead of scraping again.
 *
 * Requires: Trigger.dev v3 configured.
 *
 * This file is a STUB — it will work once Trigger.dev is configured.
 */

// import { task, logger } from '@trigger.dev/sdk/v3'

/*
export const enrichLead = task({
  id: 'enrich-lead',
  maxDuration: 60, // 1 minute per lead
  run: async (payload: { leadId: string }) => {
    const { leadId } = payload

    // Call the same API endpoint that the dashboard uses
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/leads/${leadId}/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) {
      const err = await res.json()
      logger.error('Lead enrichment failed', { leadId, error: err })
      throw new Error(err.error || 'Enrichment failed')
    }

    const result = await res.json()
    logger.info('Lead enriched', {
      leadId,
      industry: result.detected_industry,
      logoSource: result.logo_source,
    })

    return { leadId, industry: result.detected_industry }
  },
})
*/

// Placeholder export until Trigger.dev is configured
export const ENRICH_LEAD_STUB = true
