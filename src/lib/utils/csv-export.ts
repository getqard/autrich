/**
 * CSV / XLSX Export für Leads.
 *
 * Spalten symmetrisch zum CSV-Import (`csv-parser.ts`) — was hier rauskommt,
 * kann via Upload in eine andere Campaign re-importiert werden.
 *
 * UTF-8 BOM in CSV, damit Excel auf Windows die Sonderzeichen direkt lesen kann.
 */

import * as XLSX from 'xlsx'
import type { Lead } from '@/lib/supabase/types'

export type ExportColumn = {
  key: string
  label: string
  get: (lead: Lead) => string | number | null
}

export const EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'business_name', label: 'Ladenname', get: (l) => l.business_name },
  { key: 'email', label: 'E-Mail', get: (l) => l.email },
  { key: 'website_url', label: 'Webseite', get: (l) => l.website_url },
  { key: 'industry', label: 'Branche', get: (l) => l.industry },
  { key: 'city', label: 'Stadt', get: (l) => l.city },
  { key: 'phone', label: 'Telefon', get: (l) => l.phone },
  { key: 'contact_name', label: 'Inhaber', get: (l) => l.contact_name },
  { key: 'instagram_handle', label: 'Instagram', get: (l) => l.instagram_handle },
  { key: 'address', label: 'Adresse', get: (l) => l.address },
  { key: 'pipeline_status', label: 'Pipeline-Status', get: (l) => l.pipeline_status },
  { key: 'triage_status', label: 'Triage-Status', get: (l) => l.triage_status },
  { key: 'enrichment_status', label: 'Enrichment-Status', get: (l) => l.enrichment_status },
  { key: 'email_status', label: 'Email-Status', get: (l) => l.email_status },
  { key: 'pass_status', label: 'Pass-Status', get: (l) => l.pass_status },
  { key: 'lead_score', label: 'Lead-Score', get: (l) => l.lead_score ?? null },
  { key: 'logo_url', label: 'Logo-URL', get: (l) => l.logo_url },
  { key: 'dominant_color', label: 'Brand-Farbe', get: (l) => l.dominant_color },
  { key: 'google_rating', label: 'Google-Rating', get: (l) => l.google_rating ?? null },
  { key: 'google_reviews_count', label: 'Google-Reviews', get: (l) => l.google_reviews_count ?? null },
  { key: 'detected_industry', label: 'AI-Branche', get: (l) => l.detected_industry },
  { key: 'detected_reward', label: 'AI-Geschenk', get: (l) => l.detected_reward },
  { key: 'email_subject', label: 'Email-Betreff', get: (l) => l.email_subject },
  { key: 'email_strategy', label: 'Email-Strategie', get: (l) => l.email_strategy },
  { key: 'download_page_slug', label: 'Slug', get: (l) => l.download_page_slug },
  { key: 'created_at', label: 'Erstellt', get: (l) => l.created_at },
]

function escapeCsvField(value: string | number | null): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Wrap in quotes if contains delimiter, newline, or quote
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Build CSV string with UTF-8 BOM, semicolon delimiter (Excel-DE default).
 */
export function leadsToCsv(leads: Lead[]): string {
  const header = EXPORT_COLUMNS.map((c) => c.label).join(';')
  const rows = leads.map((lead) =>
    EXPORT_COLUMNS.map((c) => escapeCsvField(c.get(lead))).join(';')
  )
  return '﻿' + [header, ...rows].join('\r\n')
}

/**
 * Build XLSX workbook as ArrayBuffer (compatible with Next.js Response BodyInit).
 */
export function leadsToXlsx(leads: Lead[]): ArrayBuffer {
  const data = leads.map((lead) => {
    const row: Record<string, string | number | null> = {}
    for (const col of EXPORT_COLUMNS) {
      row[col.label] = col.get(lead)
    }
    return row
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

/** Filename: leads-{slug?}-{YYYY-MM-DD}.{ext} */
export function buildExportFilename(scope: string | null, ext: 'csv' | 'xlsx'): string {
  const date = new Date().toISOString().slice(0, 10)
  const slug = scope ? `-${scope.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}` : ''
  return `leads${slug}-${date}.${ext}`
}
