'use client'

/**
 * Stage 1 — Triage
 *
 * Zweck: Scraped Leads schnell prüfen, bevor AI-Enrichment läuft (spart Tokens).
 * Layout: Business-Karte links, GMaps-Embed + Website-Preview rechts.
 * Inline-Edit: Name + Website-URL (falls GMaps-Scrape falsch war).
 * Actions: Approve / Reject / Skip.
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Star, Globe, Phone, Instagram, MapPin, Clock, Pencil, Check } from 'lucide-react'
import { SwipeBoard, SwipeAction } from '@/components/swipe/SwipeBoard'

type TriageLead = {
  id: string
  business_name: string
  email: string | null
  city: string | null
  address: string | null
  postal_code: string | null
  bundesland: string | null
  website_url: string | null
  phone: string | null
  lat: number | null
  lng: number | null
  industry: string | null
  gmaps_category: string | null
  google_rating: number | null
  google_reviews_count: number | null
  opening_hours: Record<string, unknown> | null
  social_links: Record<string, string> | null
  extra_data: Record<string, unknown> | null
  gmaps_photos: string[] | null
  logo_url: string | null
  instagram_handle: string | null
  instagram_bio: string | null
  instagram_followers: number | null
  contact_name: string | null
  lead_score: number
  source: string
}

export default function TriagePage() {
  const params = useParams()
  const campaignId = params.id as string

  const [leads, setLeads] = useState<TriageLead[]>([])
  const [total, setTotal] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  // Inline-Edit State (pro Lead)
  const [editing, setEditing] = useState<null | 'name' | 'website'>(null)
  const [editName, setEditName] = useState('')
  const [editWebsite, setEditWebsite] = useState('')

  const loadLeads = useCallback(async (offset = 0) => {
    const res = await fetch(`/api/campaigns/${campaignId}/triage-leads?offset=${offset}&limit=20`)
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
      setEditing(null)
      setEditName(lead.business_name)
      setEditWebsite(lead.website_url || '')
    }
  }, [lead?.id])

  async function handleAction(leadId: string, action: SwipeAction) {
    const body: Record<string, unknown> = { action }
    if (action === 'approve') {
      if (editName && editName !== lead?.business_name) body.name = editName
      if (editWebsite !== (lead?.website_url || '')) body.website_url = editWebsite
    }
    await fetch(`/api/leads/${leadId}/triage-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  function saveEdit() {
    setEditing(null)
    // Lokal updaten — wird beim Approve persistiert
    if (lead) {
      setLeads(prev => prev.map((l, i) =>
        i === currentIndex
          ? { ...l, business_name: editName || l.business_name, website_url: editWebsite || null }
          : l
      ))
    }
  }

  const renderCard = (l: TriageLead) => {
    const mapsQuery = l.lat && l.lng
      ? `${l.lat},${l.lng}`
      : encodeURIComponent(`${l.business_name} ${l.address || l.city || ''}`)
    const mapsEmbed = `https://www.google.com/maps?q=${mapsQuery}&z=15&output=embed`

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Business-Karte */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {editing === 'name' ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit() }}
                    autoFocus
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-lg font-bold"
                  />
                  <button onClick={saveEdit} className="p-2 bg-blue-600 hover:bg-blue-500 rounded">
                    <Check size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <h2 className="text-2xl font-bold leading-tight break-words">{editName || l.business_name}</h2>
                  <button
                    onClick={() => setEditing('name')}
                    className="text-zinc-500 hover:text-white mt-1 shrink-0"
                    title="Name bearbeiten"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
              <p className="text-zinc-400 text-sm mt-1">
                {l.gmaps_category || l.industry || 'Kategorie unbekannt'}
              </p>
            </div>
            {l.logo_url && (
              <img src={l.logo_url} alt="" className="w-14 h-14 rounded-lg object-contain bg-zinc-800" />
            )}
          </div>

          {/* Rating */}
          {l.google_rating != null && (
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <Star
                    key={n}
                    size={14}
                    className={n <= Math.round(l.google_rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-700'}
                  />
                ))}
              </div>
              <span className="text-zinc-300 font-medium">{l.google_rating?.toFixed(1)}</span>
              <span className="text-zinc-500">({l.google_reviews_count || 0} Reviews)</span>
            </div>
          )}

          {/* Address */}
          {(l.address || l.city) && (
            <div className="flex items-start gap-2 text-sm text-zinc-300">
              <MapPin size={14} className="text-zinc-500 mt-0.5 shrink-0" />
              <span>
                {l.address}
                {l.postal_code && `, ${l.postal_code}`}
                {l.city && ` ${l.city}`}
              </span>
            </div>
          )}

          {/* Phone */}
          {l.phone && (
            <a href={`tel:${l.phone}`} className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white">
              <Phone size={14} className="text-zinc-500" />
              {l.phone}
            </a>
          )}

          {/* Instagram */}
          {l.instagram_handle && (
            <a
              href={`https://instagram.com/${l.instagram_handle.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white"
            >
              <Instagram size={14} className="text-zinc-500" />
              @{l.instagram_handle.replace('@', '')}
              {l.instagram_followers && (
                <span className="text-zinc-600 text-xs">
                  {(l.instagram_followers / 1000).toFixed(1)}k
                </span>
              )}
            </a>
          )}

          {/* Website (editable) */}
          <div className="flex items-center gap-2 text-sm">
            <Globe size={14} className="text-zinc-500 shrink-0" />
            {editing === 'website' ? (
              <div className="flex gap-2 flex-1">
                <input
                  type="text"
                  value={editWebsite}
                  onChange={e => setEditWebsite(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit() }}
                  autoFocus
                  placeholder="https://..."
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"
                />
                <button onClick={saveEdit} className="p-1 bg-blue-600 hover:bg-blue-500 rounded">
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {editWebsite || l.website_url ? (
                  <a
                    href={editWebsite || l.website_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline truncate"
                  >
                    {(editWebsite || l.website_url!).replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  <span className="text-zinc-600 italic">Keine Website</span>
                )}
                <button
                  onClick={() => setEditing('website')}
                  className="text-zinc-500 hover:text-white shrink-0"
                  title="Website bearbeiten"
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Opening Hours */}
          {l.opening_hours && Object.keys(l.opening_hours).length > 0 && (
            <details className="text-sm">
              <summary className="flex items-center gap-2 text-zinc-400 cursor-pointer hover:text-white">
                <Clock size={14} /> Öffnungszeiten
              </summary>
              <div className="mt-2 pl-6 space-y-0.5 text-zinc-400 text-xs">
                {Object.entries(l.opening_hours).map(([day, hours]) => (
                  <div key={day} className="flex justify-between">
                    <span>{day}</span>
                    <span className="text-zinc-500">{String(hours)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Score + Email */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-800 text-xs">
            <span className="text-zinc-600">Score: {l.lead_score}</span>
            {l.email && <span className="text-zinc-500 font-mono truncate max-w-[60%]">{l.email}</span>}
          </div>
        </div>

        {/* RIGHT: GMaps + Photos */}
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden aspect-video">
            <iframe
              src={mapsEmbed}
              className="w-full h-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Google Maps"
            />
          </div>

          {l.gmaps_photos && l.gmaps_photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {l.gmaps_photos.slice(0, 6).map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="w-full h-24 object-cover rounded-lg bg-zinc-800"
                  loading="lazy"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!loading && leads.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-500 mb-4">Keine Leads für Triage offen.</p>
        <Link href={`/campaigns/${campaignId}`} className="text-blue-400 hover:underline text-sm">
          Zurück zur Campaign
        </Link>
      </div>
    )
  }

  return (
    <SwipeBoard
      campaignId={campaignId}
      stageLabel="Triage"
      leads={leads}
      total={total}
      loading={loading}
      currentIndex={currentIndex}
      onIndexChange={setCurrentIndex}
      onLoadMore={loadLeads}
      onAction={handleAction}
      renderCard={renderCard}
    />
  )
}
