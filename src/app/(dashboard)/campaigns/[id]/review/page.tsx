'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Check, X, SkipForward,
  Palette, ChevronDown, ChevronUp, Sparkles,
  Pencil, RefreshCw, Image as ImageIcon,
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
  ab_group: string | null
  ab_group_override: boolean
  google_rating: number | null
  google_reviews_count: number | null
  contact_name: string | null
  lead_score: number
  download_page_slug: string | null
  pass_serial: string | null
  mockup_png_url: string | null
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
  const [regenerating, setRegenerating] = useState<string | null>(null)

  // Inline-Edit für Subject/Body (Block 3)
  const [editingSubject, setEditingSubject] = useState(false)
  const [editingBody, setEditingBody] = useState(false)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')

  // Reward-Edit (Block 3)
  const [editingReward, setEditingReward] = useState(false)
  const [editReward, setEditReward] = useState('')
  const [regeneratingPass, setRegeneratingPass] = useState(false)

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

  // Set selected strategy when lead changes — Default = ab_group, fallback email_strategy
  const lead = leads[currentIndex]
  useEffect(() => {
    if (lead) {
      setSelectedStrategy(lead.ab_group || lead.email_strategy || 'curiosity')
      setShowColorEdit(false)
      setRegenerating(null)
      setEditColors({
        bg: lead.dominant_color || '#1a1a1a',
        text: lead.text_color || '#ffffff',
        label: lead.label_color || '#999999',
      })
      setEditingSubject(false)
      setEditingBody(false)
      setEditingReward(false)
      setEditSubject(lead.email_subject || '')
      setEditBody(lead.email_body || '')
      setEditReward(lead.detected_reward || '')
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
      if (actionLoading || regenerating || !lead) return
      // Ignore wenn Nutzer gerade tippt (Input, Textarea, contentEditable)
      // oder Inline-Edit-Modus aktiv ist
      const target = e.target as HTMLElement | null
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable ||
        editingSubject ||
        editingBody ||
        editingReward
      ) return

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
  }, [lead, actionLoading, regenerating, selectedStrategy, currentIndex, editingSubject, editingBody, editingReward])

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

  async function handleRegenerate(strategy: string) {
    if (!lead || regenerating || actionLoading) return
    setRegenerating(strategy)
    try {
      const res = await fetch(`/api/leads/${lead.id}/generate-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, persist: true }),
      })
      if (res.ok) {
        const result = await res.json() as { subject: string; body: string }
        setLeads(prev => prev.map((l, i) => {
          if (i !== currentIndex) return l
          const variants = { ...(l.email_variants || {}), [strategy]: { subject: result.subject, body: result.body } }
          const overrideTriggered = !!l.ab_group && strategy !== l.ab_group
          return {
            ...l,
            email_subject: result.subject,
            email_body: result.body,
            email_strategy: strategy,
            email_variants: variants,
            ab_group_override: l.ab_group_override || overrideTriggered,
          }
        }))
        setSelectedStrategy(strategy)
      }
    } finally {
      setRegenerating(null)
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

  async function saveSubjectBody() {
    if (!lead) return
    const newSubject = editSubject
    const newBody = editBody
    // Aktualisiere auch email_variants[selectedStrategy] damit beim Strategie-Tabben die Edits erhalten bleiben
    const variants = { ...(lead.email_variants || {}), [selectedStrategy]: { subject: newSubject, body: newBody } }
    await fetch(`/api/leads/${lead.id}/inline-update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_subject: newSubject,
        email_body: newBody,
        email_variants: variants,
      }),
    })
    setLeads(prev => prev.map((l, i) =>
      i === currentIndex
        ? { ...l, email_subject: newSubject, email_body: newBody, email_variants: variants }
        : l
    ))
    setEditingSubject(false)
    setEditingBody(false)
  }

  async function regeneratePassAndEmail() {
    if (!lead || regeneratingPass) return
    setRegeneratingPass(true)
    try {
      // 1. Reward speichern
      await fetch(`/api/leads/${lead.id}/inline-update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detected_reward: editReward }),
      })
      // 2. Pass neu generieren
      await fetch(`/api/leads/${lead.id}/generate-pass`, { method: 'POST' })
      // 3. Email neu generieren (selected strategy)
      const res = await fetch(`/api/leads/${lead.id}/generate-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: selectedStrategy, persist: true }),
      })
      if (res.ok) {
        const result = await res.json() as { subject: string; body: string }
        setLeads(prev => prev.map((l, i) => {
          if (i !== currentIndex) return l
          const variants = { ...(l.email_variants || {}), [selectedStrategy]: { subject: result.subject, body: result.body } }
          return {
            ...l,
            detected_reward: editReward,
            email_subject: result.subject,
            email_body: result.body,
            email_strategy: selectedStrategy,
            email_variants: variants,
          }
        }))
        setEditSubject(result.subject)
        setEditBody(result.body)
      }
      setEditingReward(false)
    } finally {
      setRegeneratingPass(false)
    }
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

              {/* Reward-Edit + Regenerate (Block 3) */}
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-zinc-500">Belohnung</p>
                  {!editingReward && (
                    <button
                      onClick={() => { setEditingReward(true); setEditReward(lead.detected_reward || '') }}
                      className="text-zinc-500 hover:text-white"
                      title="Belohnung ändern"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                </div>
                {editingReward ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editReward}
                      onChange={e => setEditReward(e.target.value)}
                      placeholder="z.B. 1 Gratis Kaffee"
                      autoFocus
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingReward(false); setEditReward(lead.detected_reward || '') }}
                        className="px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded"
                      >
                        Abbrechen
                      </button>
                      <button
                        onClick={regeneratePassAndEmail}
                        disabled={regeneratingPass || !editReward.trim()}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 rounded disabled:opacity-50"
                      >
                        {regeneratingPass ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Pass + Email neu generieren
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-300">
                    {lead.detected_reward_emoji} {lead.detected_reward || <span className="text-zinc-600 italic">Keine Belohnung gesetzt</span>}
                  </p>
                )}
              </div>

              {/* Download Page Link */}
              {lead.download_page_slug && (
                <a
                  href={`https://deine-treuekarte.de/d/${lead.download_page_slug}`}
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
              <div className="flex gap-1.5 mb-4 flex-wrap">
                {STRATEGIES.map((s, i) => {
                  const hasVariant = lead.email_variants?.[s] != null
                  const isAbGroup = s === lead.ab_group
                  const isSelected = selectedStrategy === s
                  return (
                    <button
                      key={s}
                      onClick={() => setSelectedStrategy(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : hasVariant
                            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            : 'bg-zinc-800/50 text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300'
                      }`}
                      title={isAbGroup ? 'Zugewiesene A/B-Gruppe' : hasVariant ? 'Vorhandene Variante' : 'Klick zum Wechseln, dann generieren'}
                    >
                      <span className="text-[10px] opacity-60">{i + 1}</span>
                      {STRATEGY_LABELS[s]}
                      {isAbGroup && <span className="text-[9px] uppercase tracking-wide opacity-70">A/B</span>}
                      {!hasVariant && <span className="text-[9px] opacity-50">(neu)</span>}
                    </button>
                  )
                })}
              </div>

              {/* Email Content */}
              {currentEmail ? (
                <div className="space-y-3">
                  {/* Subject */}
                  <div className="bg-zinc-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-zinc-500">Betreff:</p>
                      {!editingSubject && (
                        <button
                          onClick={() => { setEditingSubject(true); setEditSubject(currentEmail.subject) }}
                          className="text-zinc-500 hover:text-white"
                          title="Betreff bearbeiten"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                    {editingSubject ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editSubject}
                          onChange={e => setEditSubject(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveSubjectBody()
                            if (e.key === 'Escape') { setEditingSubject(false); setEditSubject(currentEmail.subject) }
                          }}
                          autoFocus
                          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                        />
                        <button onClick={saveSubjectBody} className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded">
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-medium">{currentEmail.subject}</p>
                    )}
                  </div>

                  {/* Body */}
                  <div className="bg-zinc-800 rounded-lg p-4 max-h-80 overflow-auto">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-zinc-500">Body:</p>
                      {!editingBody && (
                        <button
                          onClick={() => { setEditingBody(true); setEditBody(currentEmail.body) }}
                          className="text-zinc-500 hover:text-white"
                          title="Body bearbeiten"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                    {editingBody ? (
                      <div className="space-y-2">
                        <textarea
                          value={editBody}
                          onChange={e => setEditBody(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') { setEditingBody(false); setEditBody(currentEmail.body) }
                          }}
                          autoFocus
                          rows={10}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs font-mono leading-relaxed"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setEditingBody(false); setEditBody(currentEmail.body) }}
                            className="px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded"
                          >
                            Abbrechen
                          </button>
                          <button
                            onClick={saveSubjectBody}
                            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded"
                          >
                            Speichern
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{currentEmail.body}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-800 rounded-lg p-6 text-center space-y-3">
                  <p className="text-xs text-zinc-500">Noch keine Email für „{STRATEGY_LABELS[selectedStrategy]}" generiert.</p>
                  <button
                    onClick={() => handleRegenerate(selectedStrategy)}
                    disabled={regenerating !== null}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-medium disabled:opacity-50"
                  >
                    {regenerating === selectedStrategy ? (
                      <><Loader2 size={12} className="animate-spin" /> Generiere…</>
                    ) : (
                      <><Sparkles size={12} /> Strategie wechseln &amp; neu generieren</>
                    )}
                  </button>
                  {lead.ab_group && selectedStrategy !== lead.ab_group && (
                    <p className="text-[10px] text-amber-400/80">Wird als Override markiert (aus A/B-Analyse ausgeschlossen)</p>
                  )}
                </div>
              )}

              {/* Strategy Info */}
              <p className="text-[10px] text-zinc-600 mt-3">
                Strategie: <span className="text-zinc-400">{STRATEGY_LABELS[selectedStrategy]}</span>
                {lead.ab_group && (
                  <span className="ml-2">· A/B: <span className="text-zinc-400">{STRATEGY_LABELS[lead.ab_group]}</span></span>
                )}
                {lead.ab_group_override && (
                  <span className="text-amber-400 ml-2">(override)</span>
                )}
              </p>
            </div>
          </div>

          {/* Mockup-Preview (Block 4 liefert die PNG) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ImageIcon size={14} /> Wallet-Mockup (Email-Anhang)
            </h3>
            {lead.mockup_png_url ? (
              <img
                src={lead.mockup_png_url}
                alt="Mockup"
                className="w-full max-w-sm mx-auto rounded-lg border border-zinc-700"
              />
            ) : (
              <div className="border border-dashed border-zinc-700 rounded-lg p-6 text-center">
                <ImageIcon size={32} className="mx-auto text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500">
                  Mockup-PNG wird in <span className="text-zinc-300 font-medium">Block 4</span> generiert
                </p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  Dann: Apple-Wallet-UI Screenshot mit Logo + Farben des Leads
                </p>
              </div>
            )}
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
              disabled={actionLoading || regenerating !== null || !currentEmail || editingSubject || editingBody || editingReward || regeneratingPass}
              title={(editingSubject || editingBody || editingReward) ? 'Erst Edit speichern oder abbrechen' : undefined}
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
