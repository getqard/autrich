import * as XLSX from 'xlsx'

export type ParsedRow = {
  business_name: string
  email: string
  website_url?: string
  industry?: string
  phone?: string
  city?: string
  address?: string
  contact_name?: string
  instagram_handle?: string
  // Extra fields aus Enrichment-Listen
  google_rating?: string
  google_reviews_count?: string
  dominant_color?: string
  google_maps_link?: string
}

export type ParseResult = {
  rows: ParsedRow[]
  errors: { row: number; message: string }[]
  headers: string[]
  totalRows: number
}

// Flexible column name mapping (deutsch + englisch)
const COLUMN_MAP: Record<string, keyof ParsedRow> = {
  // business_name
  'business_name': 'business_name',
  'name': 'business_name',
  'geschäftsname': 'business_name',
  'ladenname': 'business_name',
  'firmenname': 'business_name',
  'unternehmen': 'business_name',
  'firma': 'business_name',
  'laden': 'business_name',
  'business': 'business_name',
  'company': 'business_name',
  'shop': 'business_name',
  // email
  'email': 'email',
  'e-mail': 'email',
  'e_mail': 'email',
  'mail': 'email',
  'emailadresse': 'email',
  'email_address': 'email',
  // website
  'website_url': 'website_url',
  'website': 'website_url',
  'url': 'website_url',
  'webseite': 'website_url',
  'homepage': 'website_url',
  'web': 'website_url',
  // industry
  'industry': 'industry',
  'branche': 'industry',
  'kategorie': 'industry',
  'category': 'industry',
  'type': 'industry',
  'typ': 'industry',
  // phone
  'phone': 'phone',
  'telefon': 'phone',
  'tel': 'phone',
  'telephone': 'phone',
  'telefonnummer': 'phone',
  'phone_number': 'phone',
  'nummer': 'phone',
  // city
  'city': 'city',
  'stadt': 'city',
  'ort': 'city',
  // address
  'address': 'address',
  'adresse': 'address',
  'straße': 'address',
  'strasse': 'address',
  'anschrift': 'address',
  // contact_name
  'contact_name': 'contact_name',
  'kontakt': 'contact_name',
  'ansprechpartner': 'contact_name',
  'inhaber': 'contact_name',
  'owner': 'contact_name',
  'contact': 'contact_name',
  'vorname': 'contact_name',
  // instagram
  'instagram_handle': 'instagram_handle',
  'instagram': 'instagram_handle',
  'insta': 'instagram_handle',
}

function mapColumnName(header: string): keyof ParsedRow | null {
  const trimmed = header.trim()
  // Try exact lowercase match
  const lower = trimmed.toLowerCase()
  if (COLUMN_MAP[lower]) return COLUMN_MAP[lower]

  // Try with normalized separators
  const normalized = lower.replace(/[\s_\-\.]+/g, '_')
  if (COLUMN_MAP[normalized]) return COLUMN_MAP[normalized]

  // Try without separators
  const stripped = lower.replace(/[\s_\-\.]+/g, '')
  for (const [key, value] of Object.entries(COLUMN_MAP)) {
    if (key.replace(/[\s_\-]+/g, '') === stripped) return value
  }

  // Partial match — if header contains a known key
  for (const [key, value] of Object.entries(COLUMN_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return value
  }

  return null
}

export function parseCSV(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rawData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })

  if (rawData.length === 0) {
    return { rows: [], errors: [{ row: 0, message: 'Datei ist leer' }], headers: [], totalRows: 0 }
  }

  const headers = Object.keys(rawData[0])
  const columnMapping: Record<string, keyof ParsedRow> = {}

  for (const header of headers) {
    const mapped = mapColumnName(header)
    if (mapped) {
      columnMapping[header] = mapped
    }
  }

  // Check required columns
  const mappedFields = new Set(Object.values(columnMapping))
  const mappingInfo = Object.entries(columnMapping).map(([h, f]) => `"${h}" → ${f}`).join(', ')
  const unmappedHeaders = headers.filter(h => !columnMapping[h])

  if (!mappedFields.has('business_name')) {
    return {
      rows: [],
      errors: [{
        row: 0,
        message: `Spalte für "Name" nicht gefunden. Erkannte Spalten: [${headers.join(', ')}]. ` +
          `Gemappt: ${mappingInfo || 'keine'}. ` +
          `Verwende eine Spalte namens "Name", "Ladenname", "Firma", "Business" oder "business_name".`
      }],
      headers,
      totalRows: rawData.length,
    }
  }
  if (!mappedFields.has('email')) {
    return {
      rows: [],
      errors: [{
        row: 0,
        message: `Spalte für "Email" nicht gefunden. Erkannte Spalten: [${headers.join(', ')}]. ` +
          `Gemappt: ${mappingInfo || 'keine'}. ` +
          `Verwende eine Spalte namens "Email", "E-Mail", "Mail" oder "email".` +
          (unmappedHeaders.length > 0 ? ` Nicht erkannt: [${unmappedHeaders.join(', ')}]` : '')
      }],
      headers,
      totalRows: rawData.length,
    }
  }

  const rows: ParsedRow[] = []
  const errors: { row: number; message: string }[] = []

  for (let i = 0; i < rawData.length; i++) {
    const raw = rawData[i]
    const row: Partial<ParsedRow> = {}

    for (const [header, field] of Object.entries(columnMapping)) {
      const value = String(raw[header] || '').trim()
      if (value) {
        (row as Record<string, string>)[field] = value
      }
    }

    // Validate required
    if (!row.business_name) {
      errors.push({ row: i + 2, message: 'business_name fehlt' })
      continue
    }
    if (!row.email) {
      errors.push({ row: i + 2, message: 'email fehlt' })
      continue
    }

    rows.push(row as ParsedRow)
  }

  return { rows, errors, headers, totalRows: rawData.length }
}
