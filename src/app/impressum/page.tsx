import type { Metadata } from 'next'
import Link from 'next/link'
import { COMPANY, fullCompanyName } from '@/lib/legal/company'

export const metadata: Metadata = {
  title: `Impressum — ${COMPANY.name}`,
  description: 'Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz)',
  robots: { index: true, follow: false },
}

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/" className="text-white/40 hover:text-white text-sm">← Zurück</Link>

        <h1 className="text-3xl font-bold mt-8 mb-2">Impressum</h1>
        <p className="text-white/50 text-sm mb-10">Angaben gemäß § 5 DDG</p>

        <Section title="Anbieter">
          <p className="font-medium">{fullCompanyName()}</p>
          <p>{COMPANY.street}</p>
          <p>{COMPANY.postalCode} {COMPANY.city}</p>
          {COMPANY.country && <p>{COMPANY.country}</p>}
        </Section>

        <Section title="Vertreten durch">
          <p>{COMPANY.representative}</p>
        </Section>

        <Section title="Kontakt">
          <p>
            Email:{' '}
            <a href={`mailto:${COMPANY.contactEmail}`} className="text-blue-400 hover:underline">
              {COMPANY.contactEmail}
            </a>
          </p>
          {COMPANY.phone && <p>Telefon: {COMPANY.phone}</p>}
        </Section>

        {(COMPANY.handelsregister || COMPANY.amtsgericht) && (
          <Section title="Registereintrag">
            {COMPANY.amtsgericht && <p>{COMPANY.amtsgericht}</p>}
            {COMPANY.handelsregister && <p>Registernummer: {COMPANY.handelsregister}</p>}
          </Section>
        )}

        {COMPANY.ustId && (
          <Section title="Umsatzsteuer-ID">
            <p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a UStG:</p>
            <p className="font-mono">{COMPANY.ustId}</p>
          </Section>
        )}

        <Section title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
          <p>{COMPANY.representative}</p>
          <p>{COMPANY.street}</p>
          <p>{COMPANY.postalCode} {COMPANY.city}</p>
        </Section>

        <Section title="Streitschlichtung">
          <p className="text-sm leading-relaxed">
            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
            <a href="https://ec.europa.eu/consumers/odr/" className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
              https://ec.europa.eu/consumers/odr/
            </a>
            .<br />
            Unsere Email-Adresse finden Sie oben im Impressum.
          </p>
          <p className="text-sm leading-relaxed mt-3">
            Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </Section>

        <Section title="Haftung für Inhalte">
          <p className="text-sm leading-relaxed">
            Als Diensteanbieter sind wir gemäß § 7 Abs.1 DDG für eigene Inhalte auf diesen Seiten
            nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als
            Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
            Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige
            Tätigkeit hinweisen.
          </p>
        </Section>

        <div className="mt-12 pt-6 border-t border-white/10">
          <Link href="/datenschutz" className="text-sm text-blue-400 hover:underline">
            Datenschutzerklärung →
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
      <div className="space-y-1 text-white/90">{children}</div>
    </section>
  )
}
