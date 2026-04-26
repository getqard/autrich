import Link from 'next/link'
import { ArrowRight, Megaphone, Users, Plus } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { isCompanyConfigured } from '@/lib/legal/company'

export const dynamic = 'force-dynamic'

type FunnelStep = { label: string; value: number; href?: string; hint: string }

async function getDashboardData() {
  const supabase = createServiceClient()

  const [
    totalLeads,
    triageOpen,
    enrichReviewOpen,
    finalReviewOpen,
    queued,
    sent,
    replied,
  ] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('triage_status', 'pending'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('enrichment_review_status', 'pending'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('email_status', 'review'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('email_status', 'queued'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).in('email_status', ['sent', 'opened', 'clicked', 'replied', 'bounced']),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('email_status', 'replied'),
  ])

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, status, total_leads, created_at, settings')
    .in('status', ['draft', 'processing', 'ready', 'active', 'paused'])
    .order('created_at', { ascending: false })
    .limit(8)

  const { data: events } = await supabase
    .from('tracking_events')
    .select('id, lead_id, event_type, created_at, metadata, leads(business_name)')
    .order('created_at', { ascending: false })
    .limit(15)

  return {
    funnel: [
      { label: 'Leads gesamt', value: totalLeads.count || 0, href: '/leads', hint: 'Alle Leads in DB' },
      { label: 'Triage offen', value: triageOpen.count || 0, hint: 'Stage 1 — Lead rein/raus' },
      { label: 'Enrichment-Review', value: enrichReviewOpen.count || 0, hint: 'Stage 2 — Logo/Farben/Geschenk prüfen' },
      { label: 'Final Review', value: finalReviewOpen.count || 0, hint: 'Stage 3 — Pass + Email + Mockup' },
      { label: 'Versand-bereit', value: queued.count || 0, hint: 'Approved, wartet auf Instantly' },
      { label: 'Gesendet', value: sent.count || 0, hint: 'Ist bei Instantly raus' },
      { label: 'Geantwortet', value: replied.count || 0, hint: 'Reply erhalten' },
    ] as FunnelStep[],
    campaigns: campaigns || [],
    events: events || [],
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  const company = isCompanyConfigured()

  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <div className="text-xs text-zinc-500">
          {company.ok
            ? <span className="text-green-400">● Erfolgssinn konfiguriert</span>
            : <span className="text-amber-400">● {company.missing.length} ENV fehlen — Versand blockiert</span>}
        </div>
      </div>
      <p className="text-zinc-400 mb-8">Status auf einen Blick.</p>

      {data.funnel[0].value === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Funnel */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
            {data.funnel.map((step) => (
              <FunnelTile key={step.label} step={step} />
            ))}
          </div>

          {/* Active Campaigns + Recent Activity nebeneinander auf desktop */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-zinc-900 rounded-xl border border-zinc-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Megaphone size={18} /> Aktive Kampagnen
                </h3>
                <Link href="/campaigns" className="text-xs text-zinc-500 hover:text-white inline-flex items-center gap-1">
                  Alle ansehen <ArrowRight size={12} />
                </Link>
              </div>
              {data.campaigns.length === 0 ? (
                <div className="text-zinc-500 text-sm py-4">
                  Keine aktiven Kampagnen. <Link href="/campaigns" className="text-white underline">Erstelle eine →</Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.campaigns.map((c) => (
                    <Link
                      key={c.id}
                      href={`/campaigns/${c.id}`}
                      className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg group"
                    >
                      <div>
                        <div className="text-sm font-medium group-hover:text-white">{c.name}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {c.total_leads ?? 0} Leads · Status: {c.status}
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-zinc-600 group-hover:text-white" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users size={18} /> Letzte Aktivität
              </h3>
              {data.events.length === 0 ? (
                <p className="text-zinc-500 text-sm">Noch keine Aktivität.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {data.events.map((e) => (
                    <ActivityItem key={e.id} event={e} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function FunnelTile({ step }: { step: FunnelStep }) {
  const inner = (
    <div className="bg-zinc-900 hover:bg-zinc-800/80 rounded-xl border border-zinc-800 p-4 text-center transition-colors h-full">
      <div className="text-2xl font-bold">{step.value.toLocaleString('de-DE')}</div>
      <div className="text-xs text-zinc-400 mt-1 font-medium">{step.label}</div>
      <div className="text-[10px] text-zinc-600 mt-1 leading-tight">{step.hint}</div>
    </div>
  )
  return step.href ? <Link href={step.href}>{inner}</Link> : inner
}

function ActivityItem({ event }: { event: { id: string; event_type: string; created_at: string; lead_id: string | null; leads?: { business_name?: string | null } | { business_name?: string | null }[] | null } }) {
  const leads = Array.isArray(event.leads) ? event.leads[0] : event.leads
  const name = leads?.business_name || 'Unbekannter Lead'
  const when = new Date(event.created_at)
  const time = when.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  const date = when.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  return (
    <div className="text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate">{name}</span>
        <span className="text-zinc-600 shrink-0">{date} {time}</span>
      </div>
      <div className="text-zinc-500 mt-0.5">{event.event_type}</div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
      <h3 className="text-lg font-semibold mb-2">Noch keine Leads</h3>
      <p className="text-zinc-400 text-sm mb-6 max-w-md mx-auto">
        Erstelle eine Kampagne und füll sie über Scraping (Google Maps) oder CSV-Upload mit Leads.
        Danach laufen sie durch Triage → Enrichment-Review → Final Review → Versand.
      </p>
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200"
      >
        <Plus size={16} /> Erste Kampagne erstellen
      </Link>
    </div>
  )
}
