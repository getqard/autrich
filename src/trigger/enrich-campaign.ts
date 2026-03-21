/**
 * Batch Enrichment — Parent Job
 *
 * Enriches all pending leads in a campaign.
 * Groups by domain → scrapes each unique domain once → fans out to enrich-lead.
 *
 * Requires: Trigger.dev v3 configured.
 * To set up: npm install @trigger.dev/sdk@latest
 *            npx trigger.dev@latest init
 *
 * This file is a STUB — it will work once Trigger.dev is configured.
 */

// import { task, logger } from '@trigger.dev/sdk/v3'
// import { createServiceClient } from '@/lib/supabase/server'
// import { normalizeDomain } from '@/lib/scraping/domain-utils'
// import { scrapeWebsite } from '@/lib/enrichment/scraper'
// import { setCachedScrape, getCachedScrape } from '@/lib/enrichment/scrape-cache'

/*
export const enrichCampaign = task({
  id: 'enrich-campaign',
  maxDuration: 300, // 5 minutes
  run: async (payload: { campaignId: string }) => {
    const supabase = createServiceClient()
    const { campaignId } = payload

    logger.info('Starting campaign enrichment', { campaignId })

    // 1. Load all pending leads
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, website_url, business_name, email')
      .eq('campaign_id', campaignId)
      .eq('enrichment_status', 'pending')

    if (error || !leads?.length) {
      logger.warn('No pending leads found', { error: error?.message, count: leads?.length })
      return { processed: 0 }
    }

    logger.info(`Found ${leads.length} pending leads`)

    // 2. Group by domain → scrape each unique domain ONCE
    const domainGroups = new Map<string, string[]>() // domain → lead IDs
    const noDomain: string[] = [] // leads without website

    for (const lead of leads) {
      const domain = normalizeDomain(lead.website_url)
      if (domain) {
        const group = domainGroups.get(domain) || []
        group.push(lead.id)
        domainGroups.set(domain, group)
      } else {
        noDomain.push(lead.id)
      }
    }

    logger.info(`${domainGroups.size} unique domains, ${noDomain.length} without website`)

    // 3. Scrape each unique domain (fills cache)
    let cacheHits = 0
    let freshScrapes = 0

    for (const [domain, leadIds] of domainGroups) {
      // Find the first lead's website URL for this domain
      const representativeLead = leads.find(l => normalizeDomain(l.website_url) === domain)
      if (!representativeLead?.website_url) continue

      const cached = await getCachedScrape(representativeLead.website_url)
      if (cached) {
        cacheHits++
        logger.info(`Cache hit for ${domain} (${leadIds.length} leads)`)
      } else {
        freshScrapes++
        try {
          const result = await scrapeWebsite(representativeLead.website_url)
          await setCachedScrape(representativeLead.website_url, {
            scrapeResult: result as unknown as Record<string, unknown>,
          })
          logger.info(`Scraped ${domain} (${leadIds.length} leads)`)
        } catch (err) {
          logger.error(`Scrape failed for ${domain}`, { error: err })
        }
      }
    }

    // 4. Fan out: dispatch enrich-lead for each lead
    let processed = 0
    for (const lead of leads) {
      try {
        // In real implementation, trigger enrich-lead child task here:
        // await enrichLead.trigger({ leadId: lead.id })
        processed++

        // Update campaign progress
        await supabase
          .from('campaigns')
          .update({ processed_leads: processed })
          .eq('id', campaignId)
      } catch (err) {
        logger.error(`Failed to dispatch enrich for lead ${lead.id}`, { error: err })
      }
    }

    logger.info('Campaign enrichment complete', {
      total: leads.length,
      processed,
      cacheHits,
      freshScrapes,
    })

    return { processed, cacheHits, freshScrapes }
  },
})
*/

// Placeholder export until Trigger.dev is configured
export const ENRICH_CAMPAIGN_STUB = true
