'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Brain, ArrowLeft, Loader2, XCircle, Clock, Coins, Hash } from 'lucide-react'
import { INDUSTRIES } from '@/data/industries-seed'

type ClassificationResult = {
  detected_industry: string
  detected_reward: string
  detected_reward_emoji: string
  detected_stamp_emoji: string
  detected_pass_title: string
  detected_max_stamps: number
  strip_prompt: string
  email_hooks: string[]
  personalization_notes: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  duration_ms: number
}

export default function ClassifierPage() {
  const [form, setForm] = useState({
    business_name: '',
    industry: '',
    city: '',
    website_description: '',
    gmaps_category: '',
    has_existing_loyalty: false,
    has_app: false,
    google_rating: '',
    google_reviews_count: '',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function updateField(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleClassify() {
    if (!form.business_name.trim()) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/tools/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: form.business_name,
          industry: form.industry || undefined,
          city: form.city || undefined,
          website_description: form.website_description || undefined,
          gmaps_category: form.gmaps_category || undefined,
          has_existing_loyalty: form.has_existing_loyalty,
          has_app: form.has_app,
          google_rating: form.google_rating ? parseFloat(form.google_rating) : undefined,
          google_reviews_count: form.google_reviews_count ? parseInt(form.google_reviews_count) : undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Klassifizierung fehlgeschlagen')
        return
      }

      setResult(await res.json())
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setLoading(false)
    }
  }

  const matchedIndustry = result
    ? INDUSTRIES.find((i) => i.slug === result.detected_industry)
    : null

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
          <Brain size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">AI Business Classifier</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        Business-Daten eingeben &rarr; Industry, Reward, Emoji, Email Hooks, Personalisierung
      </p>

      {/* Form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Business Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.business_name}
              onChange={(e) => updateField('business_name', e.target.value)}
              placeholder="z.B. Döner Palace"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Industry (CSV/GMaps)</label>
            <input
              type="text"
              value={form.industry}
              onChange={(e) => updateField('industry', e.target.value)}
              placeholder="z.B. Gastronomie"
              list="industries"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <datalist id="industries">
              {INDUSTRIES.map((i) => (
                <option key={i.slug} value={i.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Stadt</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => updateField('city', e.target.value)}
              placeholder="z.B. Berlin"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">GMaps Kategorie</label>
            <input
              type="text"
              value={form.gmaps_category}
              onChange={(e) => updateField('gmaps_category', e.target.value)}
              placeholder="z.B. Türkisches Restaurant"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-zinc-300 mb-2">Website Beschreibung</label>
            <textarea
              value={form.website_description}
              onChange={(e) => updateField('website_description', e.target.value)}
              placeholder="z.B. Türkische Spezialitäten seit 2010, beste Döner in Kreuzberg..."
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={form.has_existing_loyalty}
                onChange={(e) => updateField('has_existing_loyalty', e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700"
              />
              Hat Loyalty
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={form.has_app}
                onChange={(e) => updateField('has_app', e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700"
              />
              Hat App
            </label>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-zinc-300 mb-2">Google Rating</label>
              <input
                type="number"
                value={form.google_rating}
                onChange={(e) => updateField('google_rating', e.target.value)}
                placeholder="4.5"
                min="1"
                max="5"
                step="0.1"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-zinc-300 mb-2">Reviews</label>
              <input
                type="number"
                value={form.google_reviews_count}
                onChange={(e) => updateField('google_reviews_count', e.target.value)}
                placeholder="120"
                min="0"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleClassify}
          disabled={loading || !form.business_name.trim()}
          className="mt-6 px-5 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
          Klassifizieren
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <XCircle size={16} />
            {error}
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-6">
          {/* Main Classification */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-sm mb-4">Klassifizierung</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-800 rounded-lg p-4">
                <p className="text-[10px] text-zinc-500 mb-1">Industry</p>
                <p className="text-lg font-semibold">
                  {matchedIndustry?.emoji || ''} {result.detected_industry}
                </p>
                {matchedIndustry && (
                  <p className="text-xs text-zinc-500 mt-1">{matchedIndustry.name}</p>
                )}
              </div>
              <div className="bg-zinc-800 rounded-lg p-4">
                <p className="text-[10px] text-zinc-500 mb-1">Reward</p>
                <p className="text-lg font-semibold">
                  {result.detected_reward} {result.detected_reward_emoji}
                </p>
              </div>
              <div className="bg-zinc-800 rounded-lg p-4">
                <p className="text-[10px] text-zinc-500 mb-1">Stamp Emoji</p>
                <p className="text-2xl">{result.detected_stamp_emoji}</p>
              </div>
              <div className="bg-zinc-800 rounded-lg p-4">
                <p className="text-[10px] text-zinc-500 mb-1">Pass</p>
                <p className="text-sm font-semibold">{result.detected_pass_title}</p>
                <p className="text-xs text-zinc-500 mt-1">{result.detected_max_stamps} Stempel</p>
              </div>
            </div>
          </div>

          {/* Strip Prompt */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-sm mb-3">Strip Prompt (AI Image)</h3>
            <div className="bg-zinc-800 rounded-lg p-4">
              <p className="text-xs text-zinc-300 font-mono leading-relaxed">{result.strip_prompt}</p>
            </div>
          </div>

          {/* Email Hooks */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-sm mb-3">Email Hooks</h3>
            <div className="space-y-3">
              {result.email_hooks.map((hook, i) => (
                <div key={i} className="flex gap-3 bg-zinc-800 rounded-lg p-4">
                  <span className="text-xs text-zinc-600 font-mono flex-shrink-0">{i + 1}.</span>
                  <p className="text-xs text-zinc-300 leading-relaxed">{hook}</p>
                </div>
              ))}
            </div>
            {result.personalization_notes && (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <p className="text-[10px] text-zinc-500 mb-1">Personalisierung</p>
                <p className="text-xs text-zinc-400">{result.personalization_notes}</p>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-6 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Hash size={12} />
                {result.tokens_in} in / {result.tokens_out} out
              </span>
              <span className="flex items-center gap-1.5">
                <Coins size={12} />
                ${result.cost_usd.toFixed(4)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={12} />
                {(result.duration_ms / 1000).toFixed(1)}s
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
