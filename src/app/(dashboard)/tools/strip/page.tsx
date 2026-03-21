'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Layers, ArrowLeft, Loader2, Sparkles,
  CheckCircle, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { INDUSTRIES } from '@/data/industries-seed'

type TemplateInfo = {
  id: string
  variant: string
  imageUrl: string
  storagePath?: string
  hexStart?: string
  hexEnd?: string
  prompt?: string
}

type MatchResult = {
  match: {
    variant: string
    distance: number
    imageUrl: string
    templateId: string
  } | null
  detectedVariant: string
  templates: TemplateInfo[]
  totalTemplates: number
}

type GenerateResult = {
  success: boolean
  imageUrl: string
  storagePath: string
  prompt: string
}

export default function StripPage() {
  const [industry, setIndustry] = useState('')
  const [hexColor, setHexColor] = useState('#1a1a2e')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<string | null>(null)

  async function handleMatch() {
    if (!industry || !hexColor) return
    setLoading(true)
    setError(null)
    setMatchResult(null)
    setGenerateResult(null)

    try {
      const res = await fetch('/api/tools/strip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'match', industry_slug: industry, hex_color: hexColor }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setMatchResult(data)
      if (data.match) setSelectedVariant(data.match.variant)
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate(variant: string) {
    setGenerating(true)
    setError(null)
    setGenerateResult(null)

    try {
      const res = await fetch('/api/tools/strip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', industry_slug: industry, color_variant: variant }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setGenerateResult(data)
      // Refresh match to show new template
      handleMatch()
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setGenerating(false)
    }
  }

  async function handleGenerateAll() {
    if (!confirm('Alle 80 Templates generieren? Kosten: ~$2.40. Dauert ~5 Minuten.')) return
    setGeneratingAll(true)
    setBatchProgress('Starte Batch-Generierung...')
    setError(null)

    try {
      const res = await fetch('/api/tools/strip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-all' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setBatchProgress(`Fertig! ${data.generated} generiert, ${data.failed} fehlgeschlagen.`)
      if (data.errors?.length > 0) {
        setError(data.errors.join('\n'))
      }
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setGeneratingAll(false)
    }
  }

  const industryData = INDUSTRIES.find(i => i.slug === industry)

  return (
    <div>
      <Link
        href="/tools"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Zurück zu Tools
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-zinc-800 rounded-lg">
          <Layers size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">Strip Image Generator</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        Branche + Farbe wählen &rarr; Template aus Bibliothek oder AI-generiert (1125×432px)
      </p>

      {/* Input */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Branche</label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
            >
              <option value="">Branche auswählen...</option>
              {INDUSTRIES.map(ind => (
                <option key={ind.slug} value={ind.slug}>
                  {ind.emoji} {ind.name} ({ind.slug})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Primärfarbe (Background)</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={hexColor}
                onChange={(e) => setHexColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-zinc-600 cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={hexColor}
                onChange={(e) => setHexColor(e.target.value)}
                placeholder="#000000"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 font-mono"
              />
              {industryData && (
                <button
                  onClick={() => setHexColor(industryData.default_color)}
                  className="text-[10px] px-2 py-1 bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300"
                  title="Industry Default verwenden"
                >
                  Default
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleMatch}
            disabled={loading || !industry}
            className="px-5 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
            Template suchen
          </button>
          <button
            onClick={handleGenerateAll}
            disabled={generatingAll}
            className="px-5 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generatingAll ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Alle 80 generieren (~$2.40)
          </button>
        </div>

        {batchProgress && (
          <p className="text-xs text-zinc-400 mt-3">{batchProgress}</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-400 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {/* Match Result */}
      {matchResult && (
        <div className="space-y-6">
          {/* Match Info */}
          {matchResult.match ? (
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle size={16} />
                Template gefunden: <strong>{matchResult.match.variant}</strong> (Distance: {matchResult.match.distance})
              </div>
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <AlertTriangle size={16} />
                Kein Template für &quot;{industry}&quot; — erkannter Stil: <strong>{matchResult.detectedVariant}</strong>
              </div>
            </div>
          )}

          {/* All Variants */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-sm mb-4">
              Alle Varianten für &quot;{industryData?.emoji} {industryData?.name || industry}&quot;
              <span className="text-zinc-500 font-normal ml-2">({matchResult.totalTemplates} Templates)</span>
            </h3>

            {matchResult.templates.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {matchResult.templates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className={`rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                      tmpl.variant === selectedVariant
                        ? 'border-white'
                        : tmpl.variant === matchResult.match?.variant
                          ? 'border-green-500/50'
                          : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                    onClick={() => setSelectedVariant(tmpl.variant)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tmpl.imageUrl}
                      alt={`${industry} ${tmpl.variant}`}
                      className="w-full aspect-[1125/432] object-cover"
                    />
                    <div className="p-2 bg-zinc-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-300">{tmpl.variant}</span>
                        {tmpl.variant === matchResult.match?.variant && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/20 text-green-400">match</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-zinc-500 mb-4">Keine Templates vorhanden</p>
                <div className="flex gap-2 justify-center">
                  {['dark', 'warm', 'earthy', 'vibrant'].map(v => (
                    <button
                      key={v}
                      onClick={() => handleGenerate(v)}
                      disabled={generating}
                      className="px-3 py-1.5 bg-zinc-800 rounded-lg text-xs hover:bg-zinc-700 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {v} generieren
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions for selected variant */}
            {matchResult.templates.length > 0 && (
              <div className="flex gap-2 mt-4">
                {['dark', 'warm', 'earthy', 'vibrant'].map(v => {
                  const exists = matchResult.templates.some(t => t.variant === v)
                  return (
                    <button
                      key={v}
                      onClick={() => handleGenerate(v)}
                      disabled={generating}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-lg text-xs hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {generating ? <Loader2 size={12} className="animate-spin" /> : exists ? <RefreshCw size={12} /> : <Sparkles size={12} />}
                      {v} {exists ? 'neu' : 'generieren'}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Generated Result */}
          {generateResult && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="font-semibold text-sm mb-4">Generiertes Template</h3>
              <div className="rounded-lg overflow-hidden border border-zinc-800 mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={generateResult.imageUrl}
                  alt="Generated strip"
                  className="w-full"
                />
              </div>
              <p className="text-[10px] text-zinc-600 break-all">{generateResult.prompt}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
