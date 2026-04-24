import type { Metadata } from 'next'
import Link from 'next/link'
import { COMPANY, fullCompanyName } from '@/lib/legal/company'

export const metadata: Metadata = {
  title: `Datenschutzerklärung — ${COMPANY.name}`,
  description: 'Informationen zur Verarbeitung personenbezogener Daten gemäß DSGVO',
  robots: { index: true, follow: false },
}

export default function DatenschutzPage() {
  const dpoEmail = COMPANY.dpoEmail || COMPANY.contactEmail

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/" className="text-white/40 hover:text-white text-sm">← Zurück</Link>

        <h1 className="text-3xl font-bold mt-8 mb-2">Datenschutzerklärung</h1>
        <p className="text-white/50 text-sm mb-10">
          Informationen zur Verarbeitung Ihrer personenbezogenen Daten gemäß Art. 13 DSGVO
        </p>

        <Section title="1. Verantwortlicher">
          <p>{fullCompanyName()}</p>
          <p>{COMPANY.street}</p>
          <p>{COMPANY.postalCode} {COMPANY.city}</p>
          <p className="mt-2">
            Email:{' '}
            <a href={`mailto:${dpoEmail}`} className="text-blue-400 hover:underline">
              {dpoEmail}
            </a>
          </p>
          {COMPANY.dpoName && <p className="mt-2 text-sm text-white/60">Datenschutzbeauftragter: {COMPANY.dpoName}</p>}
        </Section>

        <Section title="2. Welche Daten wir verarbeiten">
          <p>Wir verarbeiten die folgenden Daten, die öffentlich verfügbar sind:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
            <li>Firmenname, Geschäftsadresse, Kontakt-Email (aus öffentlichen Quellen wie Google Maps, Website-Impressum)</li>
            <li>Branche, Öffnungszeiten, Google-Bewertungen (öffentliche Einträge)</li>
            <li>Optional: Ansprechpartner aus Impressum oder öffentlichem LinkedIn/Instagram</li>
            <li>Beim Email-Versand: Zustell-, Öffnungs- und Klick-Status (für Zustellbarkeits-Analyse)</li>
            <li>Beim Pass-Download: IP-Adresse (temporär, für Sicherheit und Tracking-Events)</li>
          </ul>
        </Section>

        <Section title="3. Zweck der Verarbeitung">
          <p className="text-sm leading-relaxed">
            Wir nutzen die Daten, um Ihnen ein individuelles Angebot für eine digitale Treuekarte
            zu unterbreiten (Kaltakquise im B2B-Bereich). Dies umfasst die einmalige Kontaktaufnahme
            per Email sowie ggf. max. zwei Follow-up-Nachrichten, falls Sie nicht reagieren.
          </p>
        </Section>

        <Section title="4. Rechtsgrundlage">
          <p className="text-sm leading-relaxed">
            Die Verarbeitung erfolgt auf Basis unseres <strong>berechtigten Interesses</strong> gemäß
            Art. 6 Abs. 1 lit. f DSGVO — konkret der Anbahnung geschäftlicher Beziehungen im B2B-Bereich.
            Ihr Interesse am Schutz Ihrer Daten haben wir in einer Interessenabwägung berücksichtigt:
            Wir verwenden ausschließlich öffentlich verfügbare B2B-Daten und respektieren jede
            Widerspruchserklärung sofort.
          </p>
        </Section>

        <Section title="5. Empfänger / Drittland-Transfer">
          <p className="text-sm leading-relaxed">
            Zur technischen Abwicklung nutzen wir folgende Dienstleister:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
            <li><strong>Vercel Inc.</strong> (USA) — Hosting der Webseite. Datentransfer auf Basis EU-US Data Privacy Framework.</li>
            <li><strong>Supabase Inc.</strong> (EU, Frankfurt) — Datenbank und Datei-Speicher innerhalb der EU.</li>
            <li><strong>Instantly.ai</strong> (USA) — Email-Versand. Datentransfer auf Basis EU-US Data Privacy Framework.</li>
            <li><strong>Anthropic Inc.</strong> (USA) — KI-basierte Text-Generierung (Email-Inhalte). Nur aggregierte Geschäfts-Daten, keine Personendaten.</li>
          </ul>
        </Section>

        <Section title="6. Speicherdauer">
          <p className="text-sm leading-relaxed">
            Wir speichern Ihre Daten so lange, wie der Zweck besteht — also bis zu einer
            erfolgreichen Terminvereinbarung oder einem aktiven Widerspruch. Nach 24 Monaten
            ohne Interaktion löschen wir Ihre Daten automatisch, sofern keine gesetzlichen
            Aufbewahrungspflichten entgegenstehen.
          </p>
        </Section>

        <Section title="7. Ihre Rechte">
          <p className="text-sm leading-relaxed mb-2">Sie haben jederzeit das Recht auf:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li><strong>Auskunft</strong> über Ihre gespeicherten Daten (Art. 15 DSGVO)</li>
            <li><strong>Berichtigung</strong> unrichtiger Daten (Art. 16 DSGVO)</li>
            <li><strong>Löschung</strong> Ihrer Daten (Art. 17 DSGVO)</li>
            <li><strong>Einschränkung</strong> der Verarbeitung (Art. 18 DSGVO)</li>
            <li><strong>Datenübertragbarkeit</strong> (Art. 20 DSGVO)</li>
            <li><strong>Widerspruch</strong> gegen die Verarbeitung (Art. 21 DSGVO)</li>
          </ul>
          <p className="text-sm leading-relaxed mt-3">
            Zur Wahrnehmung Ihrer Rechte senden Sie eine formlose Email an{' '}
            <a href={`mailto:${dpoEmail}`} className="text-blue-400 hover:underline">
              {dpoEmail}
            </a>. Wir bearbeiten Ihre Anfrage innerhalb von 30 Tagen.
          </p>
          <p className="text-sm leading-relaxed mt-3">
            Jede Email von uns enthält zudem einen direkten Abmelde-Link. Ein Klick genügt,
            um keine weiteren Nachrichten zu erhalten und Ihre Daten aus unserem Verteiler zu entfernen.
          </p>
        </Section>

        <Section title="8. Beschwerderecht bei der Aufsichtsbehörde">
          <p className="text-sm leading-relaxed">
            Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde über unsere
            Verarbeitung Ihrer personenbezogenen Daten zu beschweren. Zuständig ist die
            Behörde des Bundeslandes, in dem Sie Ihren Sitz haben, oder die Landesbeauftragte
            für den Datenschutz Berlin.
          </p>
        </Section>

        <Section title="9. Cookies">
          <p className="text-sm leading-relaxed">
            Unsere Download-Seiten (/d/*) setzen keine Tracking-Cookies. Wir verwenden
            ausschließlich technisch notwendige Session-Informationen für den Pass-Download-Prozess.
          </p>
        </Section>

        <Section title="10. Änderungen dieser Datenschutzerklärung">
          <p className="text-sm leading-relaxed">
            Wir passen diese Datenschutzerklärung an, wenn sich rechtliche oder technische
            Rahmenbedingungen ändern. Die jeweils aktuelle Version finden Sie unter{' '}
            <Link href="/datenschutz" className="text-blue-400 hover:underline">
              {COMPANY.publicUrl}/datenschutz
            </Link>.
          </p>
        </Section>

        <div className="mt-12 pt-6 border-t border-white/10">
          <Link href="/impressum" className="text-sm text-blue-400 hover:underline">
            ← Impressum
          </Link>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60 mb-3">
        {title}
      </h2>
      <div className="space-y-1 text-white/90 leading-relaxed">{children}</div>
    </section>
  )
}
