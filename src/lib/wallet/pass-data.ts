/**
 * Pass Data Builder — Orchestrator
 *
 * Transforms Lead data into Apple + Google passes.
 * Handles: logo fetching, strip matching + gradient, upload to storage.
 */

import { randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { generateApplePass, type ApplePassInput } from './apple'
import { generateGoogleSaveLink, type GooglePassInput } from './google'
import { matchStripTemplate } from './strip'
import { applyStripGradient } from './strip-generator'
import type { Lead } from '@/lib/supabase/types'

export type PassGenerationResult = {
  applePassBuffer: Buffer
  googleSaveUrl: string
  passSerial: string
  passAuthToken: string
  appleStoragePath: string
  stripStoragePath: string | null
  applePassUrl: string
  stripPublicUrl: string | null
}

/**
 * Generate Apple + Google passes for a lead.
 * Returns all data needed to update the lead in DB.
 */
export async function generatePassesForLead(lead: Lead): Promise<PassGenerationResult> {
  const serial = lead.pass_serial || randomUUID()
  const authToken = lead.pass_auth_token || randomUUID()
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://autrich.vercel.app'
  const downloadBaseUrl = process.env.NEXT_PUBLIC_DOWNLOAD_BASE_URL || baseUrl
  const supabase = createServiceClient()

  // ─── Fetch Logo ──────────────────────────────────────────
  let logoBuffer: Buffer | null = null
  if (lead.logo_url) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(lead.logo_url, { signal: controller.signal })
      clearTimeout(timeout)
      if (res.ok) {
        logoBuffer = Buffer.from(await res.arrayBuffer())
        if (logoBuffer.length < 100) logoBuffer = null
      }
    } catch { /* use fallback */ }
  }

  // ─── Fetch/Build Strip ───────────────────────────────────
  let stripBuffer: Buffer | null = null
  let stripPublicUrl: string | null = null
  let stripStoragePath: string | null = null

  // Try to match a strip template and apply gradient
  const industry = lead.detected_industry || 'generic'
  const accentColor = lead.accent_color || lead.label_color || null
  const bgColor = lead.dominant_color || '#1a1a2e'

  const match = await matchStripTemplate(industry, accentColor)
  if (match) {
    try {
      const templateRes = await fetch(match.imageUrl)
      if (templateRes.ok) {
        const rawStrip = Buffer.from(await templateRes.arrayBuffer())
        stripBuffer = await applyStripGradient(rawStrip, bgColor)

        // Upload gradient strip to storage
        stripStoragePath = `${serial}-strip.png`
        const { error: upErr } = await supabase.storage
          .from('passes')
          .upload(stripStoragePath, stripBuffer, { contentType: 'image/png', upsert: true })

        if (!upErr) {
          const { data } = supabase.storage.from('passes').getPublicUrl(stripStoragePath)
          stripPublicUrl = data.publicUrl
        }
      }
    } catch { /* continue without strip */ }
  }

  // If we already have a strip_image_url on the lead, use that for Google
  if (!stripPublicUrl && lead.strip_image_url) {
    stripPublicUrl = lead.strip_image_url
  }

  // Logo public URL for Google (needs URL, not buffer)
  const logoPublicUrl = lead.logo_url || null

  // ─── Build Pass Data ─────────────────────────────────────
  const barcodeUrl = lead.download_page_slug
    ? `${downloadBaseUrl}/d/${lead.download_page_slug}`
    : downloadBaseUrl

  const commonData = {
    serial,
    authToken,
    businessName: lead.business_name,
    passTitle: lead.detected_pass_title || 'Treuekarte',
    backgroundColor: bgColor,
    textColor: lead.text_color || '#FFFFFF',
    labelColor: lead.label_color || '#999999',
    stampEmoji: lead.detected_stamp_emoji || '⭐',
    currentStamps: 3,
    maxStamps: lead.detected_max_stamps || 10,
    reward: lead.detected_reward || 'Überraschung',
    rewardEmoji: lead.detected_reward_emoji || '🎉',
    barcodeUrl,
    address: lead.address,
    phone: lead.phone,
    openingHours: typeof lead.opening_hours === 'string' ? lead.opening_hours : null,
    website: lead.website_url,
  }

  // ─── Generate Apple Pass ─────────────────────────────────
  const appleInput: ApplePassInput = {
    ...commonData,
    logoBuffer,
    stripBuffer,
  }
  const applePassBuffer = await generateApplePass(appleInput)

  // Upload .pkpass to storage
  const appleStoragePath = `${serial}.pkpass`
  const { error: pkpassErr } = await supabase.storage
    .from('passes')
    .upload(appleStoragePath, applePassBuffer, {
      contentType: 'application/vnd.apple.pkpass',
      upsert: true,
    })

  if (pkpassErr) {
    throw new Error(`Failed to upload .pkpass: ${pkpassErr.message}`)
  }

  const { data: appleUrlData } = supabase.storage.from('passes').getPublicUrl(appleStoragePath)

  // ─── Generate Google Save Link ───────────────────────────
  const googleInput: GooglePassInput = {
    ...commonData,
    logoPublicUrl,
    stripPublicUrl,
  }
  const { url: googleSaveUrl } = generateGoogleSaveLink(googleInput)

  return {
    applePassBuffer,
    googleSaveUrl,
    passSerial: serial,
    passAuthToken: authToken,
    appleStoragePath,
    applePassUrl: appleUrlData.publicUrl,
    stripStoragePath,
    stripPublicUrl,
  }
}
