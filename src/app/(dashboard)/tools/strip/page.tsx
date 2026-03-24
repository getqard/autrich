'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Layers, ArrowLeft, Loader2, Sparkles,
  CheckCircle, AlertTriangle, RefreshCw, Eye,
} from 'lucide-react'
import { INDUSTRIES } from '@/data/industries-seed'

const ACCENT_FAMILIES = [
  { name: 'warm',    label: 'Warm',    color: '#D4A574' },
  { name: 'red',     label: 'Red',     color: '#DC2626' },
  { name: 'cool',    label: 'Cool',    color: '#3B82F6' },
  { name: 'green',   label: 'Green',   color: '#22C55E' },
  { name: 'pink',    label: 'Pink',    color: '#EC4899' },
  { name: 'purple',  label: 'Purple',  color: '#8B5CF6' },
  { name: 'neutral', label: 'Neutral', color: '#808080' },
]

type TemplateInfo = {
  id: string
  accentFamily: string
  imageUrl: string
  storagePath?: string
}

type MatchResult = {
  match: {
    accentFamily: string
    tier: number
    imageUrl: string
    templateId: string
  } | null
  detectedFamily: string
  templates: TemplateInfo[]
  totalTemplates: number
}

type PreviewResult = {
  match: { accentFamily: string; tier: number } | null
  rawImageUrl: string
  previewBase64: string
  previewSize: number
  bgColorUsed: string
}

export default function StripPage() {
  const [industry, setIndustry] = useState('')
  const [accentColor, setAccentColor] = useState('#D4A574')
  const [bgColor, setBgColor] = useState('#1a1a2e')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [generatingIndustry, setGeneratingIndustry] = useState(false)
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<string | null>(null)

  const industryData = INDUSTRIES.find(i => i.slug === industry)

  async function handleMatch() {
    if (!industry) return
    setLoading(true)
    setError(null)
    setMatchResult(null)

    try {
      const res = await fetch('/api/tools/strip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'match', industry_slug: industry, accent_color: accentColor }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setMatchResult(data)
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setLoading(false)
    }
  }

  async function handlePreview() {
    if (!industry) return
    setLoadingPreview(true)
    setError(null)
    setPreviewResult(null)

    try {
      const res = await fetch('/api/tools/strip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', industry_slug: industry, accent_color: accentColor, bg_color: bgColor }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      if (!data.previewBase64) { setError('Kein Template gefunden'); return }
      setPreviewResult(data)
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setLoadingPreview(false)
    }
  }

  async function handleGenerate(family: string) {
    setGenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/tools/strip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', industry_slug: industry, accent_family: family }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      handleMatch() // Refresh
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setGenerating(false)
    }
  }

  async function handleGenerateIndustry() {
    if (!industry) return
    if (!confirm(`Alle 7 Templates für "${industryData?.name || industry}" generieren? Kosten: ~$0.14.`)) return
    setGeneratingIndustry(true)
    setError(null)
    setBatchProgress(`Generiere 7 Templates für ${industryData?.name || industry}...`)

    try {
      const res = await fetch('/api/tools/strip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-industry', industry_slug: industry }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setBatchProgress(`Fertig! ${data.generated} generiert, ${data.failed} fehlgeschlagen.`)
      if (data.errors?.length > 0) setError(data.errors.join('\n'))
      handleMatch()
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setGeneratingIndustry(false)
    }
  }

  async function handleGenerateAll() {
    if (!confirm('Alle 147 Templates generieren? Kosten: ~$2.94. Dauert ~15 Minuten.')) return
    setGeneratingAll(true)
    setBatchProgress('Starte Batch-Generierung (147 Templates)...')
    setError(null)

    try {
      const res = await fetch('/api/tools/strip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-all' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setBatchProgress(`Fertig! ${data.generated} generiert, ${data.skipped} übersprungen, ${data.failed} fehlgeschlagen.`)
      if (data.errors?.length > 0) setError(data.errors.join('\n'))
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setGeneratingAll(false)
    }
  }

  return (
    <div>
      <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6">
        <ArrowLeft size={14} /> Zurück zu Tools
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-zinc-800 rounded-lg">
          <Layers size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">Strip Image Generator</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        Branche + Accent-Farbe + Background-Farbe &rarr; Template-Match mit Gradient-Fade (1125x432px)
      </p>

      {/* Input Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Industry */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Branche</label>
            <select
              value={industry}
              onChange={(e) => {
                setIndustry(e.target.value)
                const ind = INDUSTRIES.find(i => i.slug === e.target.value)
                if (ind) {
                  setAccentColor(ind.default_accent)
                  setBgColor(ind.default_color)
                }
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
            >
              <option value="">Branche auswählen...</option>
              {INDUSTRIES.map(ind => (
                <option key={ind.slug} value={ind.slug}>
                  {ind.emoji} {ind.name}
                </option>
              ))}
              <option value="generic">Abstract / Generic</option>
            </select>
          </div>

          {/* Accent Color */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Accent/Label Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-zinc-600 cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
          </div>

          {/* Background Color */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Background Color (Fade)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-zinc-600 cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <button onClick={handleMatch} disabled={loading || !industry}
            className="px-5 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
            Template suchen
          </button>
          <button onClick={handlePreview} disabled={loadingPreview || !industry}
            className="px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {loadingPreview ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
            Pass-Preview mit Fade
          </button>
          <button onClick={handleGenerateIndustry} disabled={generatingIndustry || !industry}
            className="px-5 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {generatingIndustry ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {industry ? `${industryData?.emoji || ''} 7 generieren (~$0.14)` : '7 generieren'}
          </button>
          <button onClick={handleGenerateAll} disabled={generatingAll}
            className="px-5 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {generatingAll ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Alle 147 generieren (~$2.94)
          </button>
        </div>

        {batchProgress && <p className="text-xs text-zinc-400 mt-3">{batchProgress}</p>}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-400 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {/* Gradient Preview */}
      {previewResult && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <h3 className="font-semibold text-sm mb-2">
            Pass-Strip Preview
            <span className="text-zinc-500 font-normal ml-2">
              Family: {previewResult.match?.accentFamily} | Tier {previewResult.match?.tier}
            </span>
          </h3>
          <p className="text-xs text-zinc-500 mb-4">
            Links: Solid Background ({previewResult.bgColorUsed}) → Fade → Rechts: AI-Bild
          </p>

          <div className="rounded-lg overflow-hidden border border-zinc-700">
            <div style={{ backgroundColor: previewResult.bgColorUsed }} className="p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/png;base64,${previewResult.previewBase64}`} alt="Strip preview"
                className="w-full rounded" style={{ aspectRatio: '1125/432' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-[10px] text-zinc-500 mb-1">Raw Template (ohne Fade)</p>
              <div className="rounded overflow-hidden border border-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewResult.rawImageUrl} alt="Raw" className="w-full" style={{ aspectRatio: '1125/432' }} />
              </div>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 mb-1">Mit Gradient-Fade ({previewResult.bgColorUsed})</p>
              <div className="rounded overflow-hidden border border-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/png;base64,${previewResult.previewBase64}`} alt="With fade" className="w-full" style={{ aspectRatio: '1125/432' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Match Result */}
      {matchResult && (
        <div className="space-y-6">
          {matchResult.match ? (
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle size={16} />
                Tier {matchResult.match.tier} Match: <strong>{matchResult.match.accentFamily}</strong>
              </div>
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <AlertTriangle size={16} />
                Kein Template — Detected Family: <strong>{matchResult.detectedFamily}</strong>
              </div>
            </div>
          )}

          {/* All Accent Families */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-sm mb-4">
              Templates für &quot;{industryData?.emoji} {industryData?.name || industry}&quot;
              <span className="text-zinc-500 font-normal ml-2">({matchResult.totalTemplates}/7)</span>
            </h3>

            {matchResult.templates.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {ACCENT_FAMILIES.map(fam => {
                  const tmpl = matchResult.templates.find(t => t.accentFamily === fam.name)
                  const isMatch = matchResult.match?.accentFamily === fam.name

                  return (
                    <div key={fam.name} className={`rounded-xl overflow-hidden border-2 transition-all ${
                      isMatch ? 'border-green-500' : tmpl ? 'border-zinc-700' : 'border-zinc-800 border-dashed'
                    }`}>
                      {tmpl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={tmpl.imageUrl} alt={fam.name} className="w-full aspect-[1125/432] object-cover" />
                      ) : (
                        <div className="w-full aspect-[1125/432] bg-zinc-800/50 flex items-center justify-center">
                          <span className="text-[10px] text-zinc-600">fehlt</span>
                        </div>
                      )}
                      <div className="p-1.5 bg-zinc-800 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: fam.color }} />
                          <span className="text-[10px] text-zinc-300">{fam.label}</span>
                        </div>
                        {isMatch && <span className="text-[8px] px-1 rounded bg-green-500/20 text-green-400">match</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-6">Keine Templates vorhanden</p>
            )}

            {/* Per-family generate buttons */}
            <div className="flex flex-wrap gap-2 mt-4">
              {ACCENT_FAMILIES.map(fam => {
                const exists = matchResult.templates.some(t => t.accentFamily === fam.name)
                return (
                  <button key={fam.name} onClick={() => handleGenerate(fam.name)} disabled={generating}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 rounded-lg text-[10px] hover:bg-zinc-700 disabled:opacity-50">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: fam.color }} />
                    {generating ? <Loader2 size={10} className="animate-spin" /> : exists ? <RefreshCw size={10} /> : <Sparkles size={10} />}
                    {fam.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
