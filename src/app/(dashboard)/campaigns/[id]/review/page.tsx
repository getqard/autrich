'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Loader2, Check, X, SkipForward,
  Palette, ChevronDown, ChevronUp,
} from 'lucide-react'

type ReviewLead = {
  id: string
  business_name: string
  email: string | null
  city: string | null
  website_url: string | null
  logo_url: string | null
  dominant_color: string | null
  text_color: string | null
  label_color: string | null
  accent_color: string | null
  strip_image_url: string | null
  detected_industry: string | null
  detected_reward: string | null
  detected_reward_emoji: string | null
  detected_stamp_emoji: string | null
  detected_pass_title: string | null
  detected_max_stamps: number
  email_subject: string | null
  email_body: string | null
  email_strategy: string | null
  email_variants: Record<string, { subject: string; body: string }> | null
  google_rating: number | null
  google_reviews_count: number | null
  contact_name: string | null
  lead_score: number
  download_page_slug: string | null
  pass_serial: string | null
}

const STRATEGIES = ['curiosity', 'social_proof', 'direct', 'storytelling', 'provocation'] as const
const STRATEGY_LABELS: Record<string, string> = {
  curiosity: 'Curiosity',
  social_proof: 'Social Proof',
  direct: 'Direct',
  storytelling: 'Story',
  provocation: 'Provoc.',
}

export default function ReviewPage() {
  const params = useParams()
  const campaignId = params.id as string

  const [leads, setLeads] = useState<ReviewLead[]>([])
  const [total, setTotal] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Per-lead state
  const [selectedStrategy, setSelectedStrategy] = useState<string>('curiosity')
  const [showColorEdit, setShowColorEdit] = useState(false)
  const [editColors, setEditColors] = useState({ bg: '', text: '', label: '' })
  const [colorSaving, setColorSaving] = useState(false)

  // Stats
  const [approved, setApproved] = useState(0)
  const [rejected, setRejected] = useState(0)
  const [skipped, setSkipped] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)

  const loadLeads = useCallback(async (offset = 0) => {
    const res = await fetch(`/api/campaigns/${campaignId}/review-leads?offset=${offset}&limit=20`)
    if (res.ok) {
      const data = await res.json()
      if (offset === 0) {
        setLeads(data.leads)
      } else {
        setLeads(prev => [...prev, ...data.leads])
      }
      setTotal(data.total)
    }
    setLoading(false)
  }, [campaignId])

  useEffect(() => { loadLeads() }, [loadLeads])

  // Set selected strategy when lead changes
  const lead = leads[currentIndex]
  useEffect(() => {
    if (lead) {
      setSelectedStrategy(lead.email_strategy || 'curiosity')
      setShowColorEdit(false)
      setEditColors({
        bg: lead.dominant_color || '#1a1a1a',
        text: lead.text_color || '#ffffff',
        label: lead.label_color || '#999999',
      })
    }
  }, [lead])

  // Prefetch next batch
  useEffect(() => {
    if (currentIndex >= leads.length - 5 && leads.length < total) {
      loadLeads(leads.length)
    }
  }, [currentIndex, leads.length, total, loadLeads])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (actionLoading || !lead) return
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement) return

      switch (e.key) {
        case 'Enter':
          e.preventDefault()
          handleApprove()
          break
        case 'ArrowRight':
          e.preventDefault()
          handleSkip()
          break
        case 'ArrowLeft':
        case 'Escape':
          e.preventDefault()
          handleReject()
          break
        case '1': setSelectedStrategy('curiosity'); break
        case '2': setSelectedStrategy('social_proof'); break
        case '3': setSelectedStrategy('direct'); break
        case '4': setSelectedStrategy('storytelling'); break
        case '5': setSelectedStrategy('provocation'); break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead, actionLoading, selectedStrategy, currentIndex])

  async function handleApprove() {
    if (!lead || actionLoading) return
    setActionLoading(true)
    await fetch(`/api/leads/${lead.id}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', strategy: selectedStrategy }),
    })
    setApproved(a => a + 1)
    goNext()
    setActionLoading(false)
  }

  async function handleReject() {
    if (!lead || actionLoading) return
    setActionLoading(true)
    await fetch(`/api/leads/${lead.id}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    })
    setRejected(r => r + 1)
    goNext()
    setActionLoading(false)
  }

  function handleSkip() {
    if (!lead || actionLoading) return
    setSkipped(s => s + 1)
    goNext()
  }

  function goNext() {
    if (currentIndex < leads.length - 1) {
      setCurrentIndex(i => i + 1)
    }
  }

  async function saveColors() {
    if (!lead) return
    setColorSaving(true)
    await fetch(`/api/leads/${lead.id}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        colors: {
          dominant_color: editColors.bg,
          text_color: editColors.text,
          label_color: editColors.label,
        },
      }),
    })
    // Update local state
    setLeads(prev => prev.map((l, i) =>
      i === currentIndex ? { ...l, dominant_color: editColors.bg, text_color: editColors.text, label_color: editColors.label, accent_color: editColors.label } : l
    ))
    setShowColorEdit(false)
    setColorSaving(false)
  }

  // Get email content for selected strategy
  function getEmailForStrategy(strategy: string): { subject: string; body: string } | null {
    if (!lead) return null
    const variants = lead.email_variants || {}
    if (variants[strategy]) return variants[strategy]
    if (strategy === lead.email_strategy) return { subject: lead.email_subject || '', body: lead.email_body || '' }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-500 mb-4">Keine Leads zum Reviewen.</p>
        <Link href={`/campaigns/${campaignId}`} className="text-blue-400 hover:underline text-sm">
          Zurueck zur Campaign
        </Link>
      </div>
    )
  }

  const currentEmail = getEmailForStrategy(selectedStrategy)
  const isLastLead = currentIndex >= leads.length - 1 && leads.length >= total
  const bgColor = lead?.dominant_color || '#1a1a1a'
  const textColor = lead?.text_color || '#ffffff'
  const labelColor = lead?.label_color || '#999999'

  return (
    <div ref={containerRef} className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link href={`/campaigns/${campaignId}`} className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm">
          <ArrowLeft size={16} /> Campaign
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-400">{currentIndex + 1} / {total}</span>
          <span className="text-green-400">{approved} freigegeben</span>
          {rejected > 0 && <span className="text-red-400">{rejected} abgelehnt</span>}
          {skipped > 0 && <span className="text-zinc-500">{skipped} uebersprungen</span>}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-6">
        <div
          className="bg-blue-500 h-full rounded-full transition-all duration-300"
          style={{ width: `${total > 0 ? ((currentIndex + 1) / total * 100) : 0}%` }}
        />
      </div>

      {lead && (
        <>
          {/* Lead Info Bar */}
          <div className="flex items-center gap-3 mb-6 text-sm text-zinc-400">
            {lead.logo_url && (
              <img src={lead.logo_url} alt="" className="w-8 h-8 rounded bg-zinc-800 object-contain" />
            )}
            <span className="text-white font-semibold">{lead.business_name}</span>
            {lead.city && <span>{lead.city}</span>}
            {lead.google_rating && <span>{lead.google_rating} Sterne</span>}
            {lead.email && <span className="text-zinc-600">{lead.email}</span>}
            <span className="text-zinc-700 ml-auto">Score: {lead.lead_score}</span>
          </div>

          {/* Main Content: Pass + Email side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Left: Pass Preview */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Pass-Vorschau</h3>

              {/* Mini Wallet Card */}
              <div
                className="rounded-2xl p-5 mb-4 border border-zinc-700/50"
                style={{ backgroundColor: bgColor }}
              >
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  {lead.logo_url ? (
                    <img src={lead.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-white/10" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-sm font-bold" style={{ color: textColor }}>
                      {lead.business_name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold" style={{ color: textColor }}>
                      {lead.detected_pass_title || 'Treuekarte'}
                    </p>
                    <p className="text-[10px]" style={{ color: labelColor }}>
                      {lead.business_name}
                    </p>
                  </div>
                </div>

                {/* Strip Image */}
                {lead.strip_image_url && (
                  <div className="rounded-lg overflow-hidden mb-4">
                    <img src={lead.strip_image_url} alt="Strip" className="w-full h-24 object-cover" />
                  </div>
                )}

                {/* Stamps */}
                <div className="flex items-center gap-1.5 mb-2">
                  {Array.from({ length: lead.detected_max_stamps || 10 }).map((_, i) => (
                    <div key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                      i < 3 ? '' : 'opacity-30'
                    }`} style={{ backgroundColor: `${labelColor}20`, color: labelColor }}>
                      {i < 3 ? (lead.detected_stamp_emoji || '★') : '○'}
                    </div>
                  ))}
                </div>

                {/* Reward */}
                {lead.detected_reward && (
                  <p className="text-xs mt-2" style={{ color: labelColor }}>
                    {lead.detected_reward_emoji} {lead.detected_reward}
                  </p>
                )}
              </div>

              {/* Color Editor */}
              <button
                onClick={() => setShowColorEdit(!showColorEdit)}
                className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 mb-3"
              >
                <Palette size={12} />
                Farben bearbeiten
                {showColorEdit ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {showColorEdit && (
                <div className="bg-zinc-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editColors.bg}
                      onChange={e => setEditColors(c => ({ ...c, bg: e.target.value }))}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={editColors.bg}
                      onChange={e => setEditColors(c => ({ ...c, bg: e.target.value }))}
                      className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono w-24"
                    />
                    <span className="text-[10px] text-zinc-500">Background</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editColors.label}
                      onChange={e => setEditColors(c => ({ ...c, label: e.target.value }))}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={editColors.label}
                      onChange={e => setEditColors(c => ({ ...c, label: e.target.value }))}
                      className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono w-24"
                    />
                    <span className="text-[10px] text-zinc-500">Label / Accent</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editColors.text}
                      onChange={e => setEditColors(c => ({ ...c, text: e.target.value }))}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={editColors.text}
                      onChange={e => setEditColors(c => ({ ...c, text: e.target.value }))}
                      className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono w-24"
                    />
                    <span className="text-[10px] text-zinc-500">Text</span>
                  </div>
                  <button
                    onClick={saveColors}
                    disabled={colorSaving}
                    className="w-full mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium disabled:opacity-50"
                  >
                    {colorSaving ? 'Speichern...' : 'Farben speichern'}
                  </button>
                </div>
              )}

              {/* Download Page Link */}
              {lead.download_page_slug && (
                <a
                  href={`/d/${lead.download_page_slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-3 text-[10px] text-zinc-600 hover:text-zinc-400 truncate"
                >
                  /d/{lead.download_page_slug}
                </a>
              )}
            </div>

            {/* Right: Email Preview */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Email-Vorschau</h3>

              {/* Strategy Tabs */}
              <div className="flex gap-1.5 mb-4">
                {STRATEGIES.map((s, i) => {
                  const hasVariant = lead.email_variants?.[s] != null
                  return (
                    <button
                      key={s}
                      onClick={() => setSelectedStrategy(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        selectedStrategy === s
                          ? 'bg-blue-600 text-white'
                          : hasVariant
                            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            : 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                      }`}
                      disabled={!hasVariant && s !== lead.email_strategy}
                    >
                      <span className="text-[10px] text-zinc-500 mr-1">{i + 1}</span>
                      {STRATEGY_LABELS[s]}
                    </button>
                  )
                })}
              </div>

              {/* Email Content */}
              {currentEmail ? (
                <div className="space-y-3">
                  <div className="bg-zinc-800 rounded-lg p-4">
                    <p className="text-[10px] text-zinc-500 mb-1">Betreff:</p>
                    <p className="text-sm font-medium">{currentEmail.subject}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-4 max-h-64 overflow-auto">
                    <p className="text-[10px] text-zinc-500 mb-1">Body:</p>
                    <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{currentEmail.body}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-800 rounded-lg p-6 text-center">
                  <p className="text-xs text-zinc-600">Keine Email fuer diese Strategie vorhanden</p>
                </div>
              )}

              {/* Strategy Info */}
              <p className="text-[10px] text-zinc-600 mt-3">
                Strategie: <span className="text-zinc-400">{STRATEGY_LABELS[selectedStrategy]}</span>
                {selectedStrategy !== lead.email_strategy && (
                  <span className="text-amber-400 ml-2">(gewechselt von {STRATEGY_LABELS[lead.email_strategy || 'curiosity']})</span>
                )}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleReject}
              disabled={actionLoading}
              className="flex items-center gap-2 px-6 py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              <X size={18} />
              Ablehnen
              <kbd className="ml-2 text-[10px] text-red-400/50 bg-red-400/10 px-1.5 py-0.5 rounded">Esc</kbd>
            </button>

            <button
              onClick={handleSkip}
              disabled={actionLoading}
              className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              <SkipForward size={18} />
              Weiter
              <kbd className="ml-2 text-[10px] text-zinc-500/50 bg-zinc-700/50 px-1.5 py-0.5 rounded">&rarr;</kbd>
            </button>

            <button
              onClick={handleApprove}
              disabled={actionLoading || !currentEmail}
              className="flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-green-600/20"
            >
              {actionLoading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              Freigeben
              <kbd className="ml-2 text-[10px] text-green-300/50 bg-green-500/30 px-1.5 py-0.5 rounded">Enter</kbd>
            </button>
          </div>

          {/* Keyboard Hint */}
          <p className="text-center text-[10px] text-zinc-700 mt-4">
            Tastatur: Esc/Links = Ablehnen · Rechts = Weiter · Enter = Freigeben · 1-5 = Strategie
          </p>

          {/* Done Message */}
          {isLastLead && currentIndex === leads.length - 1 && (approved + rejected + skipped) > 0 && (
            <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
              <p className="text-lg font-semibold mb-2">Review abgeschlossen</p>
              <p className="text-zinc-400 text-sm mb-4">
                {approved} freigegeben, {rejected} abgelehnt, {skipped} uebersprungen
              </p>
              <Link
                href={`/campaigns/${campaignId}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
              >
                Zurueck zur Campaign
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
