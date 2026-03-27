'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Globe, RefreshCw, Brain, Image,
  Wallet, Smartphone, Mail, MessageSquare, Eye, Calendar,
  Ban, Trash2, Download, ExternalLink, Send, ChevronDown, ChevronUp,
} from 'lucide-react'
import type { Lead, PipelineStatus } from '@/lib/supabase/types'

type LeadWithEvents = Lead & {
  events: Array<{ id: string; event_type: string; metadata: unknown; created_at: string }>
}

const PIPELINE_OPTIONS: PipelineStatus[] = [
  'new', 'contacted', 'engaged', 'interested', 'demo_scheduled', 'converted', 'warm', 'lost', 'blacklisted'
]

export default function LeadDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [lead, setLead] = useState<LeadWithEvents | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showPalette, setShowPalette] = useState(false)
  const [franchiseInfo, setFranchiseInfo] = useState<{ isFranchise: boolean; franchiseCount: number; isGeneric: boolean } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [allEmails, setAllEmails] = useState<any[] | null>(null)
  const [emailsLoading, setEmailsLoading] = useState(false)
  const [pipelineRunning, setPipelineRunning] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pipelineResult, setPipelineResult] = useState<Record<string, any> | null>(null)

  const loadLead = useCallback(async () => {
    const res = await fetch(`/api/leads/${id}`)
    if (res.ok) setLead(await res.json())
    setLoading(false)
  }, [id])

  useEffect(() => { loadLead() }, [loadLead])

  // Load franchise info when lead email is available
  useEffect(() => {
    if (lead?.email) {
      fetch(`/api/leads/${id}/franchise-info`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setFranchiseInfo(data) })
        .catch(() => {})
    }
  }, [lead?.email, id])

  async function updatePipeline(status: PipelineStatus) {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_status: status }),
    })
    loadLead()
  }

  async function runFullPipeline() {
    setPipelineRunning(true)
    setPipelineResult(null)
    setAllEmails(null)
    try {
      const res = await fetch(`/api/leads/${id}/run-pipeline`, { method: 'POST' })
      const data = await res.json()
      setPipelineResult(data)
      if (data.steps?.emails?.results) setAllEmails(data.steps.emails.results)
      loadLead()
    } catch { alert('Pipeline fehlgeschlagen') }
    setPipelineRunning(false)
  }

  async function runAllEmails() {
    setEmailsLoading(true)
    setAllEmails(null)
    try {
      const res = await fetch(`/api/leads/${id}/generate-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      const data = await res.json()
      if (res.ok && data.results) setAllEmails(data.results)
      else alert(data.error || 'Fehler')
      loadLead()
    } catch { alert('Netzwerkfehler') }
    setEmailsLoading(false)
  }

  async function runAction(action: string) {
    setActionLoading(action)
    try {
      const res = await fetch(`/api/leads/${id}/${action}`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        alert(`Fehler: ${err.error || 'Unbekannt'}`)
      }
      loadLead()
    } catch {
      alert('Netzwerkfehler')
    }
    setActionLoading(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-zinc-500" /></div>
  }

  if (!lead) {
    return <p className="text-zinc-500">Lead nicht gefunden.</p>
  }

  const extraData = (lead.extra_data || {}) as Record<string, unknown>
  const industryMethod = extraData.industry_method as string | undefined
  const vibrantSwatches = extraData.vibrant_swatches as Array<{ name: string; hex: string; population: number }> | undefined

  return (
    <div>
      <Link href="/leads" className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm mb-6">
        <ArrowLeft size={16} /> Alle Leads
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold">{lead.business_name}</h2>
          <p className="text-zinc-400 mt-1">
            {lead.city || 'Keine Stadt'}
            {lead.email ? ` · ${lead.email}` : ''}
            {franchiseInfo?.isFranchise && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                Franchise ({franchiseInfo.franchiseCount} Standorte)
              </span>
            )}
            {franchiseInfo?.isGeneric && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
                Generic Email
              </span>
            )}
            {lead.website_url && (
              <> · <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{lead.website_url}</a></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">Score: <strong className="text-white">{lead.lead_score}</strong></span>
          <select
            value={lead.pipeline_status}
            onChange={(e) => updatePipeline(e.target.value as PipelineStatus)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
          >
            {PIPELINE_OPTIONS.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </select>
        </div>
      </div>

      {/* ═══ FULL PIPELINE BUTTON ═══ */}
      <div className="mb-6">
        <button onClick={runFullPipeline} disabled={pipelineRunning || !lead.website_url}
          className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl
            text-sm font-semibold hover:from-purple-500 hover:to-blue-500
            disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3
            transition-all duration-200 shadow-lg shadow-purple-500/20">
          {pipelineRunning ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Pipeline läuft... (Scrape → Pass → Email)
            </>
          ) : (
            <>
              <Wallet size={18} />
              Kompletter Flow: Scrape → Pass → Download-Seite → 5 Emails
            </>
          )}
        </button>

        {/* Pipeline Result */}
        {pipelineResult && (
          <div className="mt-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Pipeline {pipelineResult.success ? 'abgeschlossen' : 'fehlgeschlagen'}</span>
              <span className="text-[10px] text-zinc-600">{pipelineResult.durationMs}ms</span>
            </div>
            {pipelineResult.steps && Object.entries(pipelineResult.steps).map(([step, data]) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const d = data as Record<string, any>
              return (
                <div key={step} className="flex items-center gap-2 text-xs">
                  <span className={d.success ? 'text-green-400' : 'text-red-400'}>{d.success ? '✓' : '✗'}</span>
                  <span className="text-zinc-300 font-medium capitalize">{step}</span>
                  {d.durationMs && <span className="text-zinc-600">{d.durationMs as number}ms</span>}
                  {step === 'scrape' && d.contactName && <span className="text-zinc-500">({d.contactName as string})</span>}
                  {step === 'classify' && d.industry && <span className="text-zinc-500">({d.industry as string})</span>}
                  {step === 'pass' && d.serial && <span className="text-zinc-500 font-mono text-[10px]">{(d.serial as string).substring(0, 8)}</span>}
                  {step === 'emails' && d.count && <span className="text-zinc-500">{d.count as number} Strategien</span>}
                  {step === 'downloadPage' && d.url && (
                    <a href={d.url as string} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 text-[10px]">
                      {(d.slug as string)}
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Enrichment */}
          <Section title="Enrichment" status={lead.enrichment_status}>
            <div className="space-y-3">
              {/* Logo with source badge */}
              {lead.logo_url && (
                <div className="flex items-center gap-3">
                  <img src={lead.logo_url} alt="Logo" className="w-12 h-12 rounded-lg bg-zinc-800 object-contain" />
                  <LogoSourceBadge source={lead.logo_source || 'unknown'} />
                </div>
              )}

              {/* Colors: Dominant + Accent */}
              <div className="flex items-center gap-4">
                {lead.dominant_color && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded border border-zinc-600" style={{ backgroundColor: lead.dominant_color }} />
                    <div>
                      <p className="text-xs font-mono text-zinc-200">{lead.dominant_color}</p>
                      <p className="text-[10px] text-zinc-600">Background</p>
                    </div>
                  </div>
                )}
                {lead.accent_color && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded border border-zinc-600" style={{ backgroundColor: lead.accent_color }} />
                    <div>
                      <p className="text-xs font-mono text-zinc-200">{lead.accent_color}</p>
                      <p className="text-[10px] text-zinc-600">Accent</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Mini Pass Preview Card */}
              {lead.dominant_color && lead.logo_url && (
                <div>
                  <p className="text-[10px] text-zinc-600 mb-1">Pass-Vorschau</p>
                  <div
                    className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl border border-zinc-700"
                    style={{ backgroundColor: lead.dominant_color }}
                  >
                    <img
                      src={lead.logo_url}
                      alt="Logo"
                      className="w-8 h-8 rounded object-contain"
                    />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: lead.text_color || '#ffffff' }}>
                        {lead.detected_pass_title || 'Treuekarte'}
                      </p>
                      <p className="text-[10px]" style={{ color: lead.label_color || '#bbbbbb' }}>
                        {lead.detected_max_stamps || 10} Stempel
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Vibrant Palette (collapsible) */}
              {vibrantSwatches && vibrantSwatches.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowPalette(!showPalette)}
                    className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showPalette ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    Vibrant Palette ({vibrantSwatches.length})
                  </button>
                  {showPalette && (
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      {vibrantSwatches.map((s) => (
                        <div key={s.name} className="flex items-center gap-1" title={`${s.name}: ${s.hex}`}>
                          <div className="w-5 h-5 rounded border border-zinc-600" style={{ backgroundColor: s.hex }} />
                          <span className="text-[9px] text-zinc-500">{s.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Industry with method badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Industry:</span>
                <span className="text-xs text-zinc-200">{lead.detected_industry || lead.industry || '—'}</span>
                {industryMethod && (
                  <IndustryMethodBadge method={industryMethod} />
                )}
              </div>

              <Field label="Reward" value={lead.detected_reward ? `${lead.detected_reward} ${lead.detected_reward_emoji || ''}` : '—'} />
              <Field label="Pass Titel" value={lead.detected_pass_title || '—'} />
              <Field label="Instagram" value={lead.instagram_handle ? `@${lead.instagram_handle}` : '—'} />
              <Field label="Google Rating" value={lead.google_rating ? `${lead.google_rating} (${lead.google_reviews_count} Reviews)` : '—'} />
              <Field label="Loyalty vorhanden" value={lead.has_existing_loyalty ? 'Ja' : 'Nein'} />
              <Field label="Eigene App" value={lead.has_app ? 'Ja' : 'Nein'} />
              {lead.email_hooks && (lead.email_hooks as string[]).length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Email Hooks:</p>
                  {(lead.email_hooks as string[]).map((hook, i) => (
                    <p key={i} className="text-xs text-zinc-400 py-0.5">· {hook}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <ActionButton icon={Globe} label="Re-Scrape" action="enrich" loading={actionLoading} onClick={runAction} />
              <ActionButton icon={Brain} label="Re-Classify" action="classify" loading={actionLoading} onClick={runAction} />
            </div>
          </Section>

          {/* Pass */}
          <Section title="Wallet Pass" status={lead.pass_status}>
            {lead.preview_image_url && (
              <img src={lead.preview_image_url} alt="Preview" className="w-48 rounded-xl border border-zinc-800 mb-3" />
            )}
            <div className="space-y-2">
              <Field label="Apple" value={lead.apple_pass_url ? 'Generated' : 'Pending'} />
              <Field label="Google" value={lead.google_pass_url ? 'Generated' : 'Pending'} />
              <Field label="Strip" value={lead.strip_source || 'Pending'} />
              <Field label="Serial" value={lead.pass_serial || '—'} />
              <Field label="Installiert" value={lead.pass_installed ? `Ja (${lead.pass_installed_platform}) — ${new Date(lead.pass_installed_at!).toLocaleString('de-DE')}` : 'Nein'} />
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {lead.apple_pass_url && (
                <a href={`/api/passes/${lead.pass_serial}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-lg text-xs hover:bg-zinc-700">
                  <Download size={12} /> .pkpass
                </a>
              )}
              {lead.google_pass_url && (
                <a href={lead.google_pass_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-lg text-xs hover:bg-zinc-700">
                  <ExternalLink size={12} /> Google Save
                </a>
              )}
              <ActionButton icon={Image} label="Re-Generate Strip" action="generate-strip" loading={actionLoading} onClick={runAction} />
              <ActionButton icon={Wallet} label="Re-Generate Pass" action="generate-pass" loading={actionLoading} onClick={runAction} />
              <ActionButton icon={Smartphone} label="Re-Generate Preview" action="generate-preview" loading={actionLoading} onClick={runAction} />
            </div>
          </Section>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Email */}
          <Section title="Email" status={lead.email_status}>
            {lead.email_subject && (
              <div className="bg-zinc-800 rounded-lg p-4 mb-3">
                <p className="text-xs text-zinc-500 mb-1">Subject:</p>
                <p className="text-sm font-medium">{lead.email_subject}</p>
                {lead.email_strategy && (
                  <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded bg-zinc-700 text-zinc-400">
                    {lead.email_strategy} · {lead.email_variant || '—'}
                  </span>
                )}
              </div>
            )}
            {lead.email_body && (
              <div className="bg-zinc-800 rounded-lg p-4 mb-3 max-h-48 overflow-auto">
                <p className="text-xs text-zinc-400 whitespace-pre-wrap">{lead.email_body}</p>
              </div>
            )}
            <div className="space-y-2">
              <Field label="Gesendet" value={lead.email_sent_at ? new Date(lead.email_sent_at).toLocaleString('de-DE') : '—'} />
              <Field label="Geöffnet" value={lead.email_opened_at ? new Date(lead.email_opened_at).toLocaleString('de-DE') : '—'} />
              <Field label="Geklickt" value={lead.email_clicked_at ? new Date(lead.email_clicked_at).toLocaleString('de-DE') : '—'} />
              <Field label="Geantwortet" value={lead.email_replied_at ? new Date(lead.email_replied_at).toLocaleString('de-DE') : '—'} />
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <ActionButton icon={Mail} label="Re-Generate Email" action="generate-email" loading={actionLoading} onClick={runAction} />
              <button onClick={runAllEmails} disabled={emailsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 rounded-lg text-xs text-white hover:bg-amber-500 disabled:opacity-50">
                {emailsLoading ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                Alle 5 Strategien
              </button>
              <ActionButton icon={Send} label="Test an mich" action="send-test" loading={actionLoading} onClick={runAction} />
            </div>
          </Section>

          {/* All 5 Email Strategies */}
          {allEmails && (
            <Section title="Alle 5 Strategien">
              <div className="space-y-3">
                {allEmails.map((email, i) => (
                  <div key={i} className="bg-zinc-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-700 text-zinc-300 font-medium">
                        {email.strategy || `Strategie ${i + 1}`}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {email.word_count} Wörter{email.cost_usd ? ` | $${email.cost_usd.toFixed(5)}` : ''}
                      </span>
                    </div>
                    {email.error ? (
                      <p className="text-xs text-red-400">{email.error}</p>
                    ) : (
                      <>
                        <p className="text-xs text-zinc-200 font-semibold mb-1">Subject: {email.subject}</p>
                        <p className="text-[11px] text-zinc-400 whitespace-pre-wrap leading-relaxed">{email.body}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Reply */}
          {lead.reply_text && (
            <Section title="Reply" status={lead.reply_category || 'pending'}>
              <div className="bg-zinc-800 rounded-lg p-4 mb-3">
                <p className="text-xs text-zinc-400 whitespace-pre-wrap">{lead.reply_text}</p>
              </div>
              <Field label="Kategorie" value={lead.reply_category || '—'} />
              <Field label="Confidence" value={lead.reply_confidence ? `${(lead.reply_confidence * 100).toFixed(0)}%` : '—'} />
              {lead.reply_draft && (
                <div className="mt-3">
                  <p className="text-xs text-zinc-500 mb-1">AI Draft Reply:</p>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-xs text-zinc-400">{lead.reply_draft}</p>
                  </div>
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <ActionButton icon={MessageSquare} label="Re-Classify" action="classify-reply" loading={actionLoading} onClick={runAction} />
              </div>
            </Section>
          )}

          {/* Timeline */}
          <Section title="Timeline">
            {lead.events && lead.events.length > 0 ? (
              <div className="space-y-2">
                {lead.events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 py-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs">{event.event_type.replace(/_/g, ' ')}</p>
                      <p className="text-[10px] text-zinc-600">{new Date(event.created_at).toLocaleString('de-DE')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">Noch keine Events</p>
            )}
          </Section>

          {/* Actions */}
          <Section title="Actions">
            {lead.download_page_slug && (
              <a
                href={`/d/${lead.download_page_slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700 mb-2 w-full"
              >
                <Eye size={14} /> Download Page Preview
              </a>
            )}
            <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700 mb-2 w-full text-left">
              <Calendar size={14} /> Calendly Link senden
            </button>
            <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700 mb-2 w-full text-left text-red-400">
              <Ban size={14} /> Blacklist
            </button>
            <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700 w-full text-left text-red-400">
              <Trash2 size={14} /> Lead löschen
            </button>
          </Section>

          {/* Notes */}
          <Section title="Notizen">
            <textarea
              defaultValue={lead.notes || ''}
              placeholder="Notizen zu diesem Lead..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
              onBlur={(e) => {
                fetch(`/api/leads/${id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ notes: e.target.value }),
                })
              }}
            />
          </Section>
        </div>
      </div>
    </div>
  )
}

// ─── Components ─────────────────────────────────────────────

function Section({ title, status, children }: { title: string; status?: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">{title}</h3>
        {status && <StatusBadge status={status} />}
      </div>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs text-right">{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-zinc-700 text-zinc-400',
    processing: 'bg-amber-500/10 text-amber-400',
    completed: 'bg-green-500/10 text-green-400',
    ready: 'bg-green-500/10 text-green-400',
    failed: 'bg-red-500/10 text-red-400',
    review: 'bg-blue-500/10 text-blue-400',
    queued: 'bg-blue-500/10 text-blue-400',
    sent: 'bg-cyan-500/10 text-cyan-400',
    opened: 'bg-purple-500/10 text-purple-400',
    clicked: 'bg-purple-500/10 text-purple-400',
    replied: 'bg-green-500/10 text-green-400',
    bounced: 'bg-red-500/10 text-red-400',
    interested: 'bg-green-500/10 text-green-400',
    not_now: 'bg-amber-500/10 text-amber-400',
    not_interested: 'bg-red-500/10 text-red-400',
    needs_review: 'bg-yellow-500/10 text-yellow-400',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full ${colors[status] || colors.pending}`}>
      {status}
    </span>
  )
}

const LOGO_SOURCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  brandfetch: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Brandfetch' },
  'brandfetch-lettermark': { bg: 'bg-blue-500/10', text: 'text-blue-300', label: 'Brandfetch LM' },
  website: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Website' },
  gmaps: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'GMaps Foto' },
  favicon: { bg: 'bg-zinc-700', text: 'text-zinc-400', label: 'Favicon' },
  generated: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Generiert' },
  instagram: { bg: 'bg-pink-500/10', text: 'text-pink-400', label: 'Instagram' },
  google: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Google' },
}

function LogoSourceBadge({ source }: { source: string }) {
  const style = LOGO_SOURCE_STYLES[source] || { bg: 'bg-zinc-700', text: 'text-zinc-400', label: source }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

function IndustryMethodBadge({ method }: { method: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    gmaps: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'GMaps Mapping' },
    csv: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'CSV' },
    keyword: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Keyword' },
    ai: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'AI Classified' },
  }
  const style = styles[method] || { bg: 'bg-zinc-700', text: 'text-zinc-400', label: method }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

function ActionButton({
  icon: Icon, label, action, loading, onClick
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  action: string
  loading: string | null
  onClick: (action: string) => void
}) {
  const isLoading = loading === action
  return (
    <button
      onClick={() => onClick(action)}
      disabled={!!loading}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-lg text-xs hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      {label}
    </button>
  )
}
