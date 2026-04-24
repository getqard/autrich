/**
 * Zentrale Firmen-Konstanten für Impressum, Datenschutz, Email-Footer (Block 5).
 *
 * Werte kommen aus ENV-Vars. Fallbacks sind deutlich als Platzhalter markiert,
 * damit du auf Vercel sofort siehst wenn eine Variable fehlt.
 *
 * Vor dem ersten echten Email-Send: ALLE "[…zu setzen]"-Werte in Vercel
 * Environment-Variables austauschen. Kein Code-Change nötig.
 *
 * Nach Update der ENV-Vars: Vercel-Redeploy triggern (oder im Dashboard
 * "Redeploy" klicken) damit die neuen Werte aktiv werden.
 */

const placeholder = (label: string) => `[${label} – zu setzen]`

export const COMPANY = {
  // Firma & Rechtsform
  name: process.env.COMPANY_NAME || placeholder('Firmenname'),
  legalForm: process.env.COMPANY_LEGAL_FORM || '', // z.B. "GmbH", "UG (haftungsbeschränkt)", "LLC"

  // Adresse
  street: process.env.COMPANY_STREET || placeholder('Straße Nr.'),
  postalCode: process.env.COMPANY_POSTAL_CODE || placeholder('PLZ'),
  city: process.env.COMPANY_CITY || placeholder('Stadt'),
  country: process.env.COMPANY_COUNTRY || 'Deutschland',

  // Vertretung & Register (bei GmbH/UG/AG)
  representative: process.env.COMPANY_REPRESENTATIVE || placeholder('Vertretungsberechtigter'),
  handelsregister: process.env.COMPANY_HANDELSREGISTER || '', // z.B. "HRB 12345"
  amtsgericht: process.env.COMPANY_AMTSGERICHT || '',         // z.B. "Amtsgericht München"
  ustId: process.env.COMPANY_UST_ID || '',                    // z.B. "DE123456789"

  // Kontakt
  contactEmail: process.env.COMPANY_CONTACT_EMAIL || 'hello@deine-treuekarte.de',
  phone: process.env.COMPANY_PHONE || '',                     // optional

  // Datenschutz-Verantwortlicher (meist = Geschäftsführer bei kleinen Firmen)
  dpoName: process.env.COMPANY_DPO_NAME || '',
  dpoEmail: process.env.COMPANY_DPO_EMAIL || process.env.COMPANY_CONTACT_EMAIL || 'hello@deine-treuekarte.de',

  // URLs (ohne trailing slash)
  publicUrl: process.env.NEXT_PUBLIC_DOWNLOAD_BASE_URL || 'https://deine-treuekarte.de',
} as const

/**
 * Formatiert "Firmenname Rechtsform" mit Leerzeichen nur wenn beides gesetzt.
 * Beispiele: "Erfolgssinn GmbH", "Erfolgssinn LLC", oder nur "Erfolgssinn".
 */
export function fullCompanyName(): string {
  const parts = [COMPANY.name, COMPANY.legalForm].filter(Boolean)
  return parts.join(' ').trim()
}

/**
 * Formatiert Adresse als einzeiligen String für Footer.
 * Beispiel: "Musterstraße 1 · 12345 Berlin"
 */
export function oneLineAddress(): string {
  return `${COMPANY.street} · ${COMPANY.postalCode} ${COMPANY.city}`
}

/**
 * Meldet ob alle kritischen Werte echt gesetzt sind (keine Platzhalter).
 * Nützlich für: "Bist du bereit zu senden?" Checks vor Block 6.
 */
export function isCompanyConfigured(): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (COMPANY.name.startsWith('[')) missing.push('COMPANY_NAME')
  if (COMPANY.street.startsWith('[')) missing.push('COMPANY_STREET')
  if (COMPANY.postalCode.startsWith('[')) missing.push('COMPANY_POSTAL_CODE')
  if (COMPANY.city.startsWith('[')) missing.push('COMPANY_CITY')
  if (COMPANY.representative.startsWith('[')) missing.push('COMPANY_REPRESENTATIVE')
  return { ok: missing.length === 0, missing }
}
