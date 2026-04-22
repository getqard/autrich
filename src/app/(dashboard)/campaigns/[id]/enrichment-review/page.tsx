'use client'

/**
 * Stage 2 — Enrichment Review
 *
 * Zweck: AI-Enrichment prüfen + inline fixen, bevor Pass+Email generiert werden.
 * 3-Spalten-Layout:
 *   1. Business + Logo-Upload + 3 Color-Picker + Live-Preview
 *   2. AI-Klassifikation (Industry, Reward, Pass-Title, Hooks, Impressum)
 *   3. Pass-Preview (gerendert mit aktuellen Farben/Logo)
 *
 * Inline-Edits: Auto-Save nach 800ms Debounce via PATCH /inline-update
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Upload, Loader2, RefreshCw, Plus, Trash2 } from 'lucide-react'
import { SwipeBoard, SwipeAction, ExtraAction } from '@/components/swipe/SwipeBoard'
import { INDUSTRIES } from '@/data/industries-seed'

type ERLead = {
  id: string
  business_name: string
  email: string | null
  city: string | null
  website_url: string | null
  address: string | null
  logo_url: string | null
  logo_source: string | null
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
  email_hooks: string[]
  personalization_notes: string | null
  website_description: string | null
  has_existing_loyalty: boolean
  has_app: boolean
  google_rating: number | null
  google_reviews_count: number | null
  contact_name: string | null
  instagram_handle: string | null
  extra_data: Record<string, unknown> | null
  lead_score: number
}

type EditState = {
  logo_url: string
  dominant_color: string
  text_color: string
  label_color: string
  detected_industry: string
  detected_reward: string
  detected_reward_emoji: string
  detected_stamp_emoji: string
  detected_pass_title: string
  detected_max_stamps: number
  email_hooks: string[]
  contact_name: string
  email: string
}

export default function EnrichmentReviewPage() {
  const params = useParams()
  const campaignId = params.id as string

  const [leads, setLeads] = useState<ERLead[]>([])
  const [total, setTotal] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [savingField, setSavingField] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const [edit, setEdit] = useState<EditState | null>(null)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const loadLeads = useCallback(async (offset = 0) => {
    const res = await fetch(`/api/campaigns/${campaignId}/enrichment-review-leads?offset=${offset}&limit=20`)
    if (res.ok) {
      const data = await res.json()
      if (offset === 0) setLeads(data.leads)
      else setLeads(prev => [...prev, ...data.leads])
      setTotal(data.total)
    }
    setLoading(false)
  }, [campaignId])

  useEffect(() => { loadLeads(0) }, [loadLeads])

  const lead = leads[currentIndex]

  // Reset edit state when lead changes
  useEffect(() => {
    if (lead) {
      setEdit({
        logo_url: lead.logo_url || '',
        dominant_color: lead.dominant_color || '#1a1a1a',
        text_color: lead.text_color || '#ffffff',
        label_color: lead.label_color || '#999999',
        detected_industry: lead.detected_industry || '',
        detected_reward: lead.detected_reward || '',
        detected_reward_emoji: lead.detected_reward_emoji || '🎁',
        detected_stamp_emoji: lead.detected_stamp_emoji || '★',
        detected_pass_title: lead.detected_pass_title || 'Treuekarte',
        detected_max_stamps: lead.detected_max_stamps || 10,
        email_hooks: lead.email_hooks || [],
        contact_name: lead.contact_name || '',
        email: lead.email || '',
      })
    }
  }, [lead?.id])

  // Debounced save für einzelne Felder
  function queueSave(field: string, value: unknown) {
    if (!lead) return
    if (saveTimers.current[field]) clearTimeout(saveTimers.current[field])

    saveTimers.current[field] = setTimeout(async () => {
      setSavingField(field)
      try {
        await fetch(`/api/leads/${lead.id}/inline-update`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        })
        // Lokal updaten
        setLeads(prev => prev.map((l, i) =>
          i === currentIndex
            ? {
                ...l,
                [field]: value,
                ...(field === 'label_color' ? { accent_color: value as string } : {}),
              }
            : l
        ))
      } finally {
        setSavingField(null)
      }
    }, 800)
  }

  function updateField<K extends keyof EditState>(key: K, value: EditState[K]) {
    setEdit(e => e ? { ...e, [key]: value } : e)
    queueSave(key, value)
  }

  async function handleLogoFile(file: File) {
    if (!lead || !edit) return
    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append('logo', file)
      const res = await fetch(`/api/leads/${lead.id}/upload-logo`, {
        method: 'POST',
        body: fd,
      })
      if (res.ok) {
        const { logo_url } = await res.json() as { logo_url: string }
        setEdit(e => e ? { ...e, logo_url } : e)
        setLeads(prev => prev.map((l, i) => i === currentIndex ? { ...l, logo_url } : l))
      } else {
        const err = await res.json() as { error?: string }
        alert(`Logo-Upload fehlgeschlagen: ${err.error || 'Unbekannter Fehler'}`)
      }
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleAction(leadId: string, action: SwipeAction) {
    // Vor dem Action-Call: pending debounced saves flushen
    Object.values(saveTimers.current).forEach(t => clearTimeout(t))
    if (edit && lead) {
      // Alle Felder die sich von Lead unterscheiden, sofort saven
      const dirty: Record<string, unknown> = {}
      if (edit.logo_url !== (lead.logo_url || '')) dirty.logo_url = edit.logo_url
      if (edit.dominant_color !== (lead.dominant_color || '#1a1a1a')) dirty.dominant_color = edit.dominant_color
      if (edit.text_color !== (lead.text_color || '#ffffff')) dirty.text_color = edit.text_color
      if (edit.label_color !== (lead.label_color || '#999999')) dirty.label_color = edit.label_color
      if (edit.detected_industry !== (lead.detected_industry || '')) dirty.detected_industry = edit.detected_industry
      if (edit.detected_reward !== (lead.detected_reward || '')) dirty.detected_reward = edit.detected_reward
      if (edit.detected_reward_emoji !== (lead.detected_reward_emoji || '🎁')) dirty.detected_reward_emoji = edit.detected_reward_emoji
      if (edit.detected_stamp_emoji !== (lead.detected_stamp_emoji || '★')) dirty.detected_stamp_emoji = edit.detected_stamp_emoji
      if (edit.detected_pass_title !== (lead.detected_pass_title || 'Treuekarte')) dirty.detected_pass_title = edit.detected_pass_title
      if (edit.detected_max_stamps !== lead.detected_max_stamps) dirty.detected_max_stamps = edit.detected_max_stamps
      if (JSON.stringify(edit.email_hooks) !== JSON.stringify(lead.email_hooks || [])) dirty.email_hooks = edit.email_hooks
      if (edit.contact_name !== (lead.contact_name || '')) dirty.contact_name = edit.contact_name
      if (edit.email !== (lead.email || '')) dirty.email = edit.email
      if (Object.keys(dirty).length > 0) {
        await fetch(`/api/leads/${leadId}/inline-update`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dirty),
        })
      }
    }

    await fetch(`/api/leads/${leadId}/enrichment-review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
  }

  const renderCard = (l: ERLead) => {
    if (!edit) return null
    const bg = edit.dominant_color
    const text = edit.text_color
    const label = edit.label_color

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* COL 1: Business + Logo + Colors */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-xl font-bold leading-tight">{l.business_name}</h2>
            <p className="text-zinc-500 text-xs mt-0.5">
              {l.city || '—'}
              {l.google_rating && <> · {l.google_rating.toFixed(1)}★ ({l.google_reviews_count})</>}
            </p>
          </div>

          {/* Logo Upload */}
          <div>
            <p className="text-xs text-zinc-500 mb-2">Logo</p>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) handleLogoFile(f)
              }}
              className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                dragOver ? 'border-white bg-zinc-800/50' : 'border-zinc-700 hover:border-zinc-500'
              }`}
            >
              {edit.logo_url ? (
                <img
                  src={edit.logo_url}
                  alt=""
                  className="w-20 h-20 mx-auto rounded-lg object-contain bg-zinc-800"
                />
              ) : (
                <div className="w-20 h-20 mx-auto rounded-lg bg-zinc-800 flex items-center justify-center text-2xl text-zinc-600">
                  ?
                </div>
              )}
              <label className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-400 cursor-pointer hover:text-white">
                {uploadingLogo ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                Datei wählen oder droppen
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleLogoFile(f)
                  }}
                />
              </label>
            </div>
            <input
              type="text"
              value={edit.logo_url}
              onChange={e => updateField('logo_url', e.target.value)}
              placeholder="…oder URL eingeben"
              className="mt-2 w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs font-mono"
            />
          </div>

          {/* Colors */}
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">Farben</p>
            <ColorInput
              label="Background"
              value={edit.dominant_color}
              onChange={v => updateField('dominant_color', v)}
            />
            <ColorInput
              label="Text"
              value={edit.text_color}
              onChange={v => updateField('text_color', v)}
            />
            <ColorInput
              label="Label / Accent"
              value={edit.label_color}
              onChange={v => updateField('label_color', v)}
            />
          </div>

          {/* Contact */}
          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <p className="text-xs text-zinc-500">Kontakt (Impressum)</p>
            <input
              type="text"
              value={edit.contact_name}
              onChange={e => updateField('contact_name', e.target.value)}
              placeholder="Ansprechpartner"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs"
            />
            <input
              type="email"
              value={edit.email}
              onChange={e => updateField('email', e.target.value)}
              placeholder="Email"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs font-mono"
            />
          </div>

          <div className="text-[10px] text-zinc-600 pt-2 border-t border-zinc-800">
            Score: {l.lead_score} · Source: {l.logo_source || '—'}
            {l.has_existing_loyalty && <> · <span className="text-amber-400">Loyalty-System vorhanden</span></>}
          </div>
        </div>

        {/* COL 2: AI Classification */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-300">AI-Klassifikation</h3>

          {/* Industry */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Branche</label>
            <select
              value={edit.detected_industry}
              onChange={e => updateField('detected_industry', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
            >
              <option value="">— wählen —</option>
              {INDUSTRIES.map(ind => (
                <option key={ind.slug} value={ind.slug}>{ind.emoji} {ind.name}</option>
              ))}
            </select>
          </div>

          {/* Pass Title */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Pass-Titel</label>
            <input
              type="text"
              value={edit.detected_pass_title}
              onChange={e => updateField('detected_pass_title', e.target.value)}
              placeholder="Treuekarte"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
            />
          </div>

          {/* Reward */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Belohnung</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={edit.detected_reward_emoji}
                onChange={e => updateField('detected_reward_emoji', e.target.value)}
                className="w-12 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-center"
                maxLength={4}
              />
              <input
                type="text"
                value={edit.detected_reward}
                onChange={e => updateField('detected_reward', e.target.value)}
                placeholder="z.B. 1 Gratis Kaffee"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* Stamps */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Stempel</label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={edit.detected_stamp_emoji}
                onChange={e => updateField('detected_stamp_emoji', e.target.value)}
                className="w-12 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-center"
                maxLength={4}
              />
              <input
                type="number"
                value={edit.detected_max_stamps}
                onChange={e => updateField('detected_max_stamps', parseInt(e.target.value) || 10)}
                className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                min={3}
                max={20}
              />
              <span className="text-xs text-zinc-500">× bis Belohnung</span>
            </div>
          </div>

          {/* Email Hooks */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Email-Hook-Points</label>
            <div className="space-y-1.5">
              {edit.email_hooks.map((hook, i) => (
                <div key={i} className="flex gap-1">
                  <input
                    type="text"
                    value={hook}
                    onChange={e => {
                      const next = [...edit.email_hooks]
                      next[i] = e.target.value
                      updateField('email_hooks', next)
                    }}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs"
                  />
                  <button
                    onClick={() => updateField('email_hooks', edit.email_hooks.filter((_, j) => j !== i))}
                    className="text-zinc-500 hover:text-red-400 px-2"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => updateField('email_hooks', [...edit.email_hooks, ''])}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white"
              >
                <Plus size={12} /> Hook hinzufügen
              </button>
            </div>
          </div>

          {/* Website description (read-only) */}
          {l.website_description && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Website-Beschreibung</label>
              <p className="text-xs text-zinc-400 bg-zinc-800 rounded p-2 max-h-20 overflow-auto">
                {l.website_description}
              </p>
            </div>
          )}

          {/* Save indicator */}
          <div className="text-[10px] text-zinc-600 flex items-center gap-2 pt-2 border-t border-zinc-800">
            {savingField ? (
              <><Loader2 size={10} className="animate-spin" /> Speichere {savingField}…</>
            ) : (
              <span>Auto-Save aktiv · Enter im Button = Freigeben</span>
            )}
          </div>
        </div>

        {/* COL 3: Pass Preview */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-300">Pass-Vorschau</h3>

          {/* Mini Wallet Card */}
          <div
            className="rounded-2xl p-5 border border-zinc-700/50"
            style={{ backgroundColor: bg }}
          >
            <div className="flex items-center gap-3 mb-4">
              {edit.logo_url ? (
                <img src={edit.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-white/10" />
              ) : (
                <div
                  className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-sm font-bold"
                  style={{ color: text }}
                >
                  {l.business_name.charAt(0)}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold" style={{ color: text }}>
                  {edit.detected_pass_title || 'Treuekarte'}
                </p>
                <p className="text-[10px]" style={{ color: label }}>
                  {l.business_name}
                </p>
              </div>
            </div>

            {l.strip_image_url && (
              <div className="rounded-lg overflow-hidden mb-4">
                <img src={l.strip_image_url} alt="Strip" className="w-full h-24 object-cover" />
              </div>
            )}

            {/* Stamps */}
            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
              {Array.from({ length: edit.detected_max_stamps }).map((_, i) => (
                <div
                  key={i}
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    i < 3 ? '' : 'opacity-30'
                  }`}
                  style={{ backgroundColor: `${label}20`, color: label }}
                >
                  {i < 3 ? edit.detected_stamp_emoji : '○'}
                </div>
              ))}
            </div>

            {edit.detected_reward && (
              <p className="text-xs mt-2" style={{ color: label }}>
                {edit.detected_reward_emoji} {edit.detected_reward}
              </p>
            )}
          </div>

          {l.personalization_notes && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Personalization-Notes (AI)</p>
              <p className="text-xs text-zinc-400 bg-zinc-800 rounded p-2">
                {l.personalization_notes}
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const extraActions = (): ExtraAction[] => [
    {
      key: 'reenrich',
      label: 'Re-enrich',
      icon: <RefreshCw size={16} />,
      onClick: async () => {
        if (!lead) return
        if (!confirm('Enrichment für diesen Lead neu laufen lassen? Alle AI-Daten werden überschrieben.')) return
        await handleAction(lead.id, 'reenrich' as SwipeAction)
        // Nach Re-enrich: Lead aus aktueller Liste entfernen + currentIndex clampen.
        setLeads(prev => {
          const next = prev.filter((_, i) => i !== currentIndex)
          // Clamp: wenn currentIndex nun out-of-range, auf letztes Item setzen
          if (currentIndex >= next.length && next.length > 0) {
            setCurrentIndex(next.length - 1)
          }
          setTotal(t => Math.max(0, t - 1))
          return next
        })
      },
      className: 'flex items-center gap-2 px-6 py-3 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-50',
    },
  ]

  if (!loading && leads.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-500 mb-4">Keine Leads für Enrichment-Review offen.</p>
        <Link href={`/campaigns/${campaignId}`} className="text-blue-400 hover:underline text-sm">
          Zurück zur Campaign
        </Link>
      </div>
    )
  }

  return (
    <SwipeBoard
      campaignId={campaignId}
      stageLabel="Enrichment-Review"
      leads={leads}
      total={total}
      loading={loading}
      currentIndex={currentIndex}
      onIndexChange={setCurrentIndex}
      onLoadMore={loadLeads}
      onAction={handleAction}
      renderCard={renderCard}
      extraActions={extraActions}
    />
  )
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent"
      />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs font-mono"
      />
      <span className="text-[10px] text-zinc-500 w-24 text-right">{label}</span>
    </div>
  )
}
