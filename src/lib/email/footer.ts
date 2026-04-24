/**
 * Email-Footer (Block 5) — DSGVO-/TMG-konforme Pflichtangaben für Cold Emails.
 *
 * Kompakter Footer-Block, visuell unauffällig (10px hellgrau), unterhalb des
 * eigentlichen Email-Inhalts. Enthält:
 *   - Firmenname + Rechtsform
 *   - Postanschrift
 *   - Vertretungsberechtigte + Registereintrag (falls vorhanden)
 *   - USt-ID (falls vorhanden)
 *   - Impressum-Link + Datenschutz-Link
 *   - Abmelde-Link als Instantly-Platzhalter {{unsubscribe_link}}
 *
 * Zwei Render-Modi:
 *   - 'html': Inline-CSS für Email-Clients, hellgrauer Text, max-width 540px
 *   - 'text': Plain-Text-Fallback für Mail-Reader ohne HTML-Support
 *
 * Der Footer wird NICHT in lead.email_body persistiert — er wird erst beim
 * Versand (Block 6) bzw. in der Preview-Route hinten angehängt. So bleibt
 * der AI-generierte Body "rein" und der Footer kann zentral geändert werden.
 */

import { COMPANY, fullCompanyName, oneLineAddress } from '@/lib/legal/company'

export type FooterFormat = 'html' | 'text'

/**
 * Rendert den Email-Footer im gewünschten Format.
 *
 * {{unsubscribe_link}} bleibt als Platzhalter stehen — Instantly ersetzt
 * ihn beim Versand durch den echten Opt-out-Link.
 */
export function renderFooter(format: FooterFormat): string {
  if (format === 'html') return renderHtmlFooter()
  return renderTextFooter()
}

function renderHtmlFooter(): string {
  const lines: string[] = []

  // Firmenname + Adresse
  lines.push(`<strong style="color:#666">${escapeHtml(fullCompanyName())}</strong>`)
  lines.push(escapeHtml(oneLineAddress()))

  // Vertretung + Register (falls gesetzt)
  const registryParts: string[] = []
  if (COMPANY.representative && !COMPANY.representative.startsWith('[')) {
    registryParts.push(`Vertreten durch ${escapeHtml(COMPANY.representative)}`)
  }
  if (COMPANY.handelsregister && COMPANY.amtsgericht) {
    registryParts.push(`${escapeHtml(COMPANY.amtsgericht)} ${escapeHtml(COMPANY.handelsregister)}`)
  }
  if (COMPANY.ustId) {
    registryParts.push(`USt-ID ${escapeHtml(COMPANY.ustId)}`)
  }
  if (registryParts.length > 0) {
    lines.push(registryParts.join(' &middot; '))
  }

  // Links: Impressum, Datenschutz, Abmelden
  const linkStyle = 'color:#888;text-decoration:underline'
  const impressumUrl = `${COMPANY.publicUrl}/impressum`
  const datenschutzUrl = `${COMPANY.publicUrl}/datenschutz`
  const linksRow = [
    `<a href="${impressumUrl}" style="${linkStyle}">Impressum</a>`,
    `<a href="${datenschutzUrl}" style="${linkStyle}">Datenschutz</a>`,
    `<a href="{{unsubscribe_link}}" style="${linkStyle}">Abmelden</a>`,
  ].join(' &middot; ')
  lines.push(linksRow)

  const body = lines.join('<br>')

  return `
<!-- Autrich Legal Footer (Block 5) -->
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:10px;line-height:1.5;color:#888">
  ${body}
</div>
`.trim()
}

function renderTextFooter(): string {
  const lines: string[] = []
  lines.push('--')
  lines.push(fullCompanyName())
  lines.push(oneLineAddress())

  const registryParts: string[] = []
  if (COMPANY.representative && !COMPANY.representative.startsWith('[')) {
    registryParts.push(`Vertreten durch ${COMPANY.representative}`)
  }
  if (COMPANY.handelsregister && COMPANY.amtsgericht) {
    registryParts.push(`${COMPANY.amtsgericht} ${COMPANY.handelsregister}`)
  }
  if (COMPANY.ustId) {
    registryParts.push(`USt-ID ${COMPANY.ustId}`)
  }
  if (registryParts.length > 0) {
    lines.push(registryParts.join(' · '))
  }

  lines.push('')
  lines.push(`Impressum: ${COMPANY.publicUrl}/impressum`)
  lines.push(`Datenschutz: ${COMPANY.publicUrl}/datenschutz`)
  lines.push(`Abmelden: {{unsubscribe_link}}`)

  return lines.join('\n')
}

/**
 * Baut einen plain-text Body plus angehängtem Footer (2 Leerzeilen Abstand).
 * Für Systeme die keinen separaten HTML-Teil unterstützen.
 */
export function appendTextFooter(body: string): string {
  return `${body}\n\n${renderTextFooter()}`
}

/**
 * Baut eine komplette HTML-Email: Body in <pre-line>-Style + HTML-Footer darunter.
 * Nutzt einen minimalen Wrapper — keine Email-Templates, keine Header-Grafiken.
 */
export function buildHtmlEmail(opts: {
  bodyPlainText: string
  subject: string
  mockupImgUrl?: string | null
}): string {
  const bodyHtml = escapeHtml(opts.bodyPlainText).replace(/\n/g, '<br>')

  const mockupBlock = opts.mockupImgUrl
    ? `<div style="margin:24px 0;text-align:center"><img src="${opts.mockupImgUrl}" alt="Treuekarten-Vorschau" width="240" style="max-width:100%;height:auto;border-radius:12px"></div>`
    : ''

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:#222">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div>${bodyHtml}</div>
    ${mockupBlock}
    ${renderHtmlFooter()}
  </div>
</body>
</html>`
}

// ─── Helpers ────────────────────────────────────────────────────

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
