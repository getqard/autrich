/**
 * Mockup-Quality-Gate
 *
 * Entscheidet ob die gescrapeten Logo+Color-Daten eines Leads "gut genug"
 * für ein hochwertiges Mockup sind — oder ob wir lieber auf Generic
 * (Industry-Emoji + Default-Color) zurückfallen sollten.
 *
 * Heuristik (alle müssen erfüllt sein):
 *   - logo_url existiert UND logo_source ist nicht 'generated' oder 'favicon'
 *   - dominant_color, text_color, label_color sind alle gesetzt
 *   - WCAG-Kontrast text↔bg ≥ 4.5 (AA für Body-Text)
 *   - WCAG-Kontrast label↔bg ≥ 3.0 (AA Large)
 *
 * Reason-Strings sind UI-tauglich (Deutsch) — werden im Lead-Detail angezeigt.
 */

import { hexToRgb, relativeLuminance, contrastRatio } from '@/lib/enrichment/colors'
import type { Lead } from '@/lib/supabase/types'

export type QualityCheckResult = {
  ok: boolean
  reason: string
  details: {
    logoOk: boolean
    logoReason: string
    contrastTextOk: boolean
    contrastTextRatio: number | null
    contrastLabelOk: boolean
    contrastLabelRatio: number | null
  }
}

const LOW_QUALITY_LOGO_SOURCES = new Set(['generated', 'favicon'])

function isValidHex(s: string | null | undefined): s is string {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s)
}

function wcag(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1)
  const c2 = hexToRgb(hex2)
  const lum1 = relativeLuminance(c1.r, c1.g, c1.b)
  const lum2 = relativeLuminance(c2.r, c2.g, c2.b)
  return contrastRatio(lum1, lum2)
}

/**
 * Bewertet ob ein Lead's gescrapete Daten für ein hochwertiges Mockup ausreichen.
 */
export function evaluateScrapedQuality(lead: Lead): QualityCheckResult {
  // ─── Logo-Check ───────────────────────────────────────────
  let logoOk = false
  let logoReason = ''

  if (!lead.logo_url) {
    logoReason = 'kein Logo gescrapt'
  } else if (lead.logo_source && LOW_QUALITY_LOGO_SOURCES.has(lead.logo_source)) {
    logoReason = lead.logo_source === 'generated'
      ? 'Logo ist Initialen-Fallback (kein echtes Logo gefunden)'
      : 'Logo ist Favicon (zu niedrige Qualität)'
  } else {
    logoOk = true
    logoReason = `Logo aus ${lead.logo_source || 'website'}`
  }

  // ─── Color-Check ──────────────────────────────────────────
  const bg = lead.dominant_color
  const text = lead.text_color
  const label = lead.label_color

  let contrastTextOk = false
  let contrastTextRatio: number | null = null
  let contrastLabelOk = false
  let contrastLabelRatio: number | null = null

  if (isValidHex(bg) && isValidHex(text)) {
    contrastTextRatio = wcag(text, bg)
    contrastTextOk = contrastTextRatio >= 4.5
  }

  if (isValidHex(bg) && isValidHex(label)) {
    contrastLabelRatio = wcag(label, bg)
    contrastLabelOk = contrastLabelRatio >= 3.0
  }

  // ─── Verdict ──────────────────────────────────────────────
  const ok = logoOk && contrastTextOk && contrastLabelOk

  let reason = ''
  if (ok) {
    reason = 'Scraping-Qualität gut'
  } else {
    const issues: string[] = []
    if (!logoOk) issues.push(logoReason)
    if (!contrastTextOk) issues.push(
      contrastTextRatio !== null
        ? `Text-Kontrast zu niedrig (${contrastTextRatio.toFixed(1)}:1, Min 4.5)`
        : 'Text-/Background-Farbe fehlt'
    )
    if (!contrastLabelOk) issues.push(
      contrastLabelRatio !== null
        ? `Label-Kontrast zu niedrig (${contrastLabelRatio.toFixed(1)}:1, Min 3.0)`
        : 'Label-/Background-Farbe fehlt'
    )
    reason = issues.join(' · ')
  }

  return {
    ok,
    reason,
    details: {
      logoOk,
      logoReason,
      contrastTextOk,
      contrastTextRatio,
      contrastLabelOk,
      contrastLabelRatio,
    },
  }
}

/**
 * Entscheidet — basierend auf user-mode + scraping-quality — welcher Mockup-Modus
 * effektiv genutzt wird.
 *
 * mode:
 *   'auto'     → Quality-Gate entscheidet (Default)
 *   'scraped'  → erzwinge Scraped (auch bei schlechter Qualität)
 *   'generic'  → erzwinge Generic
 */
export function resolveMockupMode(
  lead: Lead,
  mode: 'auto' | 'scraped' | 'generic',
): { effective: 'scraped' | 'generic'; quality: QualityCheckResult; userMode: string } {
  const quality = evaluateScrapedQuality(lead)

  let effective: 'scraped' | 'generic'
  if (mode === 'scraped') effective = 'scraped'
  else if (mode === 'generic') effective = 'generic'
  else effective = quality.ok ? 'scraped' : 'generic'

  return { effective, quality, userMode: mode }
}
