'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Globe, ArrowLeft, Loader2, CheckCircle, XCircle,
  AlertTriangle, Clock, Share2, FileText, Palette,
  Image, ChevronDown, ChevronUp, Wallet, Download, ExternalLink,
} from 'lucide-react'

type LogoCandidate = {
  url: string
  source: string
  width: number | null
  height: number | null
  score: number
}

type ColorCandidate = {
  hex: string
  role: 'background' | 'accent' | 'text' | 'border'
  source: string
  confidence: number
}

type BrandColors = {
  backgroundColor: string | null
  accentColor: string | null
  source: string | null
  confidence: number
  candidates: ColorCandidate[]
}

type VibrantSwatch = {
  name: string
  hex: string
  population: number
}

type EnrichmentPreview = {
  logo: { base64: string; source: string } | null
  colors: { dominant: string; accent: string | null; textColor: string; labelColor: string; swatches: VibrantSwatch[] } | null
  industry: { slug: string; method: string; gmapsCategory: string | null; emoji: string | null; defaultReward: string | null } | null
  passPreview: { bg: string; text: string; label: string; method?: string } | null
}

type CacheInfo = {
  hit: boolean
  cachedAt?: string
  domain?: string | null
}

type ScrapeResult = {
  url: string
  finalUrl: string
  title: string | null
  description: string | null
  logoCandidates: LogoCandidate[]
  bestLogo: LogoCandidate | null
  structuredData: Record<string, unknown>
  socialLinks: Record<string, string>
  loyaltyDetected: boolean
  appDetected: boolean
  themeColor: string | null
  brandColors: BrandColors
  scrapeDurationMs: number
  websiteType?: 'website' | 'instagram-only' | 'redirect-to-instagram' | 'no-website'
  error?: string
  enrichmentPreview?: EnrichmentPreview
  _cache?: CacheInfo
}

export default function ScraperPage() {
  const [url, setUrl] = useState('')
  const [gmapsCategory, setGmapsCategory] = useState('')
  const [forceRescrape, setForceRescrape] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScrapeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPalette, setShowPalette] = useState(false)
  const [generatingPass, setGeneratingPass] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [passResult, setPassResult] = useState<Record<string, any> | null>(null)
  const [passError, setPassError] = useState<string | null>(null)

  async function handleGeneratePass() {
    if (!result?.enrichmentPreview) return
    setGeneratingPass(true)
    setPassResult(null)
    setPassError(null)

    const ep = result.enrichmentPreview
    const sd = result.structuredData as Record<string, unknown> || {}

    try {
      const res = await fetch('/api/tools/generate-demo-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: result.title || url.replace(/https?:\/\/(www\.)?/, '').split('/')[0],
          url: result.finalUrl || url,
          logo_base64: ep.logo?.base64 || null,
          background_color: ep.passPreview?.bg || '#1a1a2e',
          text_color: ep.passPreview?.text || '#ffffff',
          label_color: ep.passPreview?.label || '#999999',
          industry_slug: ep.industry?.slug || null,
          gmaps_category: gmapsCategory || null,
          address: sd.address as string || null,
          phone: sd.telephone as string || null,
          website: result.finalUrl || url,
        }),
      })

      const data = await res.json()
      if (!res.ok) { setPassError(data.error); return }
      setPassResult(data)
    } catch {
      setPassError('Netzwerkfehler')
    } finally {
      setGeneratingPass(false)
    }
  }

  async function handleScrape() {
    if (!url.trim()) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const body: Record<string, string | boolean> = { url: url.trim() }
      if (gmapsCategory.trim()) body.gmaps_category = gmapsCategory.trim()
      if (forceRescrape) body.force = true

      // Extract business name from URL for initials fallback
      try {
        const domain = new URL(url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`).hostname
        body.business_name = domain.replace(/^www\./, '').split('.')[0]
      } catch { /* skip */ }

      const res = await fetch('/api/tools/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Scraping fehlgeschlagen')
        return
      }

      setResult(await res.json())
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setLoading(false)
    }
  }

  const ep = result?.enrichmentPreview

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
          <Globe size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">Website Scraper</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        URL eingeben &rarr; Logo, Farben, Meta-Daten, Structured Data, Social Links extrahieren
      </p>

      {/* Input */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <label className="block text-sm font-medium text-zinc-300 mb-2">Website URL</label>
        <div className="flex gap-3 mb-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            onKeyDown={(e) => e.key === 'Enter' && handleScrape()}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
          />
          <button
            onClick={handleScrape}
            disabled={loading || !url.trim()}
            className="px-5 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
            Scrapen
          </button>
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-zinc-500 mb-1">GMaps Kategorie (optional — für Industry Mapping)</label>
            <input
              type="text"
              value={gmapsCategory}
              onChange={(e) => setGmapsCategory(e.target.value)}
              placeholder="z.B. Turkish restaurant, Barber shop, Cafe"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
              <input
                type="checkbox"
                checked={forceRescrape}
                onChange={(e) => setForceRescrape(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800"
              />
              Force Re-Scrape
            </label>
          </div>
        </div>
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

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Cache Hit Badge */}
          {result._cache?.hit && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <Clock size={16} />
                Cache Hit
                {result._cache.cachedAt && (
                  <span className="text-blue-300">
                    (gecached {new Date(result._cache.cachedAt).toLocaleString('de-DE')})
                  </span>
                )}
                {result._cache.domain && (
                  <span className="text-blue-300/60 font-mono text-xs">{result._cache.domain}</span>
                )}
              </div>
            </div>
          )}

          {/* Instagram-only indicator */}
          {(result.websiteType === 'instagram-only' || result.websiteType === 'redirect-to-instagram') && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-purple-400 text-sm">
                <AlertTriangle size={16} />
                {result.websiteType === 'instagram-only'
                  ? 'Instagram-URL erkannt — Website-Scraping & Screenshot übersprungen'
                  : 'Website leitet zu Instagram weiter — als Instagram-Only behandelt'}
                {result.socialLinks?.instagram && (
                  <span className="text-purple-300 font-mono ml-1">@{result.socialLinks.instagram}</span>
                )}
              </div>
            </div>
          )}

          {/* Warning if partial result */}
          {result.error && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <AlertTriangle size={16} />
                {result.error}
              </div>
            </div>
          )}

          {/* ─── ENRICHMENT PREVIEW ────────────────────────── */}
          {ep && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Image size={14} className="text-zinc-500" />
                <h3 className="font-semibold text-sm">Enrichment Preview</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Logo */}
                <div>
                  <p className="text-[10px] text-zinc-600 mb-2 uppercase tracking-wide">Logo</p>
                  <div className="flex items-center gap-4">
                    {ep.logo ? (
                      <>
                        <div className="w-16 h-16 bg-zinc-800 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`data:image/png;base64,${ep.logo.base64}`}
                            alt="Logo"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div>
                          <LogoSourceBadge source={ep.logo.source} />
                          <p className="text-[10px] text-zinc-600 mt-1">512x512 PNG</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-600">Kein Logo gefunden</p>
                    )}
                  </div>
                </div>

                {/* Pass Colors (actual pass colors, not palette) */}
                <div>
                  <p className="text-[10px] text-zinc-600 mb-2 uppercase tracking-wide">Pass-Farben</p>
                  {ep.passPreview ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg border border-zinc-600" style={{ backgroundColor: ep.passPreview.bg }} />
                        <div>
                          <p className="text-xs font-mono text-zinc-200">{ep.passPreview.bg}</p>
                          <p className="text-[10px] text-zinc-500">Background</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg border border-zinc-600" style={{ backgroundColor: ep.passPreview.label }} />
                        <div>
                          <p className="text-xs font-mono text-zinc-200">{ep.passPreview.label}</p>
                          <p className="text-[10px] text-zinc-500">Label</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg border border-zinc-600" style={{ backgroundColor: ep.passPreview.text }} />
                        <div>
                          <p className="text-xs font-mono text-zinc-200">{ep.passPreview.text}</p>
                          <p className="text-[10px] text-zinc-500">Text</p>
                        </div>
                      </div>
                    </div>
                  ) : ep.colors ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg border border-zinc-600" style={{ backgroundColor: ep.colors.dominant }} />
                        <div>
                          <p className="text-xs font-mono text-zinc-200">{ep.colors.dominant}</p>
                          <p className="text-[10px] text-zinc-500">Palette Dominant</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600">Keine Farben extrahiert</p>
                  )}
                </div>
              </div>

              {/* Pass Preview */}
              {ep.passPreview && ep.logo && (
                <div className="mt-5">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Pass-Vorschau</p>
                    {ep.passPreview.method && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                        {ep.passPreview.method}
                      </span>
                    )}
                  </div>
                  <div
                    className="inline-flex items-center gap-3 px-5 py-3 rounded-xl border border-zinc-700"
                    style={{ backgroundColor: ep.passPreview.bg }}
                  >
                    <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:image/png;base64,${ep.logo.base64}`}
                        alt="Logo"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: ep.passPreview.text }}>Treuekarte</p>
                      <p className="text-[10px]" style={{ color: ep.passPreview.label }}>10 Stempel</p>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded border border-zinc-600" style={{ backgroundColor: ep.passPreview.bg }} />
                      <span className="text-[9px] font-mono text-zinc-500">{ep.passPreview.bg}</span>
                      <span className="text-[9px] text-zinc-600">BG</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded border border-zinc-600" style={{ backgroundColor: ep.passPreview.label }} />
                      <span className="text-[9px] font-mono text-zinc-500">{ep.passPreview.label}</span>
                      <span className="text-[9px] text-zinc-600">Label</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded border border-zinc-600" style={{ backgroundColor: ep.passPreview.text }} />
                      <span className="text-[9px] font-mono text-zinc-500">{ep.passPreview.text}</span>
                      <span className="text-[9px] text-zinc-600">Text</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Vibrant Palette (collapsible) */}
              {ep.colors?.swatches && ep.colors.swatches.length > 0 && (
                <div className="mt-5">
                  <button
                    onClick={() => setShowPalette(!showPalette)}
                    className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showPalette ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    Vibrant Palette ({ep.colors.swatches.length} Swatches)
                  </button>
                  {showPalette && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {ep.colors.swatches.map((s) => (
                        <div key={s.name} className="flex items-center gap-1.5">
                          <div
                            className="w-6 h-6 rounded border border-zinc-600"
                            style={{ backgroundColor: s.hex }}
                            title={`${s.name}: ${s.hex} (pop: ${s.population})`}
                          />
                          <div>
                            <p className="text-[10px] text-zinc-400">{s.name}</p>
                            <p className="text-[9px] font-mono text-zinc-600">{s.hex}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Industry */}
              {ep.industry && (
                <div className="mt-5">
                  <p className="text-[10px] text-zinc-600 mb-1 uppercase tracking-wide">Industry</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{ep.industry.emoji} {ep.industry.slug}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                      {ep.industry.method === 'gmaps' ? 'GMaps Mapping' : 'AI Classified'}
                    </span>
                    {ep.industry.gmapsCategory && (
                      <span className="text-[10px] text-zinc-600">({ep.industry.gmapsCategory})</span>
                    )}
                  </div>
                  {ep.industry.defaultReward && (
                    <p className="text-[10px] text-zinc-500 mt-1">Default Reward: {ep.industry.defaultReward}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Logo Candidates */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-sm mb-4">Logo-Kandidaten ({result.logoCandidates.length})</h3>
            {result.logoCandidates.length === 0 ? (
              <p className="text-xs text-zinc-600">Keine Logos gefunden</p>
            ) : (
              <div className="space-y-3">
                {result.logoCandidates.map((logo, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-4 p-3 rounded-lg ${
                      i === 0 ? 'bg-green-500/5 border border-green-500/20' : 'bg-zinc-800'
                    }`}
                  >
                    <div className="w-12 h-12 bg-zinc-700 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logo.url}
                        alt={`Logo ${i + 1}`}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {i === 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                            Best Match
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
                          {logo.source}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          Score: {logo.score}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 truncate mt-1">{logo.url}</p>
                      {logo.width && (
                        <p className="text-[10px] text-zinc-600 mt-0.5">{logo.width}x{logo.height}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Brand Colors */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Palette size={14} className="text-zinc-500" />
              <h3 className="font-semibold text-sm">Brand Colors (CSS)</h3>
              {result.brandColors?.confidence > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  result.brandColors.confidence >= 0.8 ? 'bg-green-500/20 text-green-400' :
                  result.brandColors.confidence >= 0.5 ? 'bg-amber-500/20 text-amber-400' :
                  'bg-zinc-700 text-zinc-400'
                }`}>
                  {Math.round(result.brandColors.confidence * 100)}% Confidence
                </span>
              )}
            </div>

            {result.brandColors?.backgroundColor ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-14 h-14 rounded-lg border border-zinc-600 flex-shrink-0"
                      style={{ backgroundColor: result.brandColors.backgroundColor }}
                    />
                    <div>
                      <p className="text-xs text-zinc-500">Background</p>
                      <p className="text-sm font-mono text-zinc-200">{result.brandColors.backgroundColor}</p>
                      {result.brandColors.source && (
                        <p className="text-[10px] text-zinc-600 mt-0.5">{result.brandColors.source}</p>
                      )}
                    </div>
                  </div>
                  {result.brandColors.accentColor && (
                    <div className="flex items-center gap-3">
                      <div
                        className="w-14 h-14 rounded-lg border border-zinc-600 flex-shrink-0"
                        style={{ backgroundColor: result.brandColors.accentColor }}
                      />
                      <div>
                        <p className="text-xs text-zinc-500">Accent</p>
                        <p className="text-sm font-mono text-zinc-200">{result.brandColors.accentColor}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* All candidates */}
                {result.brandColors.candidates.length > 1 && (
                  <div>
                    <p className="text-[10px] text-zinc-600 mb-2">Alle Farb-Kandidaten ({result.brandColors.candidates.length})</p>
                    <div className="space-y-1.5">
                      {result.brandColors.candidates.map((c, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div
                            className="w-5 h-5 rounded border border-zinc-600 flex-shrink-0"
                            style={{ backgroundColor: c.hex }}
                          />
                          <span className="text-xs font-mono text-zinc-300 w-16">{c.hex}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{c.role}</span>
                          <span className="text-[10px] text-zinc-600 truncate">{c.source}</span>
                          <span className="text-[10px] text-zinc-600 ml-auto">{Math.round(c.confidence * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">Keine Brand Colors im CSS gefunden — Fallback auf Logo-Palette</p>
            )}
          </div>

          {/* Meta & Structured Data */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={14} className="text-zinc-500" />
                <h3 className="font-semibold text-sm">Meta-Daten</h3>
              </div>
              <div className="space-y-3">
                <Field label="Title" value={result.title || '—'} />
                <Field label="Description" value={result.description || '—'} />
                <Field label="Final URL" value={result.finalUrl} />
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Share2 size={14} className="text-zinc-500" />
                <h3 className="font-semibold text-sm">Social Links</h3>
              </div>
              {Object.keys(result.socialLinks).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(result.socialLinks).map(([platform, handle]) => (
                    <div key={platform} className="flex justify-between items-center">
                      <span className="text-xs text-zinc-500 capitalize">{platform}</span>
                      <span className="text-xs text-zinc-300">{handle}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">Keine Social Links gefunden</p>
              )}
            </div>
          </div>

          {/* Structured Data */}
          {Object.keys(result.structuredData).length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="font-semibold text-sm mb-4">Structured Data (JSON-LD)</h3>
              <div className="space-y-2">
                {Object.entries(result.structuredData).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-start gap-4">
                    <span className="text-xs text-zinc-500 flex-shrink-0">{key}</span>
                    <span className="text-xs text-zinc-300 text-right">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detection + Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="font-semibold text-sm mb-4">Detection</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Theme Color</span>
                  {result.themeColor ? (
                    <span className="flex items-center gap-2 text-xs text-zinc-300">
                      <span className="w-4 h-4 rounded border border-zinc-600" style={{ backgroundColor: result.themeColor }} />
                      {result.themeColor}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-600">Nicht gesetzt</span>
                  )}
                </div>
              <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Loyalty/Treuekarte</span>
                  {result.loyaltyDetected ? (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle size={12} /> Gefunden
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-zinc-600">
                      <XCircle size={12} /> Nicht gefunden
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Eigene App</span>
                  {result.appDetected ? (
                    <span className="flex items-center gap-1 text-xs text-amber-400">
                      <CheckCircle size={12} /> App gefunden
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-zinc-600">
                      <XCircle size={12} /> Keine App
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="font-semibold text-sm mb-4">Performance</h3>
              <div className="flex items-center gap-2 text-zinc-400">
                <Clock size={14} />
                <span className="text-sm">{(result.scrapeDurationMs / 1000).toFixed(1)}s</span>
              </div>
            </div>
          </div>

          {/* ─── Pass Generation ─────────────────────────────── */}
          {ep && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Wallet size={18} className="text-zinc-400" />
              <h3 className="font-semibold text-sm">Demo-Pass generieren</h3>
            </div>

            {/* Preview of what will be generated */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
              <div>
                <span className="text-zinc-500">Business</span>
                <p className="text-zinc-300 mt-0.5">{result.title || 'Unbekannt'}</p>
              </div>
              <div>
                <span className="text-zinc-500">Branche</span>
                <p className="text-zinc-300 mt-0.5">{ep.industry?.emoji} {ep.industry?.slug || 'auto-detect'}</p>
              </div>
              <div>
                <span className="text-zinc-500">Farben</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: ep.passPreview?.bg }} />
                  <span className="text-zinc-300 font-mono">{ep.passPreview?.bg}</span>
                </div>
              </div>
              <div>
                <span className="text-zinc-500">Prämie</span>
                <p className="text-zinc-300 mt-0.5">{ep.industry?.defaultReward || 'Auto via AI'}</p>
              </div>
            </div>

            <button onClick={handleGeneratePass} disabled={generatingPass}
              className="px-5 py-2.5 bg-white text-black rounded-lg text-sm font-semibold hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              {generatingPass ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
              Apple + Google Pass generieren
            </button>

            {passError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-4">
                <p className="text-sm text-red-400">{passError}</p>
              </div>
            )}

            {passResult && (
              <div className="mt-4 space-y-3">
                {/* Industry detected */}
                {passResult.industry && (
                  <div className="text-xs text-zinc-500">
                    Branche: <span className="text-zinc-300">
                      {(passResult.industry as Record<string, string>).emoji} {(passResult.industry as Record<string, string>).slug}
                    </span>
                    {' | '}Prämie: <span className="text-zinc-300">{(passResult.industry as Record<string, string>).reward}</span>
                    {' | '}Stempel: <span className="text-zinc-300">{(passResult.industry as Record<string, string>).stampEmoji}</span>
                    {' | '}Methode: <span className="text-zinc-300">{(passResult.industry as Record<string, string>).method}</span>
                  </div>
                )}

                {/* Apple Result */}
                {passResult.apple && !(passResult.apple as Record<string, string>).error && (
                  <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-400 font-medium">Apple .pkpass</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {(((passResult.apple as Record<string, number>).sizeBytes) / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <a href={(passResult.apple as Record<string, string>).downloadUrl}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500">
                      <Download size={14} /> Download .pkpass
                    </a>
                  </div>
                )}
                {(passResult.apple as Record<string, string>)?.error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <p className="text-sm text-red-400">Apple: {(passResult.apple as Record<string, string>).error}</p>
                  </div>
                )}

                {/* Google Result */}
                {passResult.google && !(passResult.google as Record<string, string>).error && (
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-400 font-medium">Google Wallet</p>
                      <p className="text-xs text-zinc-500 mt-0.5 max-w-xs truncate">
                        {((passResult.google as Record<string, string>).saveUrl || '').substring(0, 60)}...
                      </p>
                    </div>
                    <a href={(passResult.google as Record<string, string>).saveUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">
                      <ExternalLink size={14} /> Google Wallet
                    </a>
                  </div>
                )}
                {(passResult.google as Record<string, string>)?.error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <p className="text-sm text-red-400">Google: {(passResult.google as Record<string, string>).error}</p>
                  </div>
                )}

                {/* Duration */}
                <p className="text-[10px] text-zinc-600">{passResult.durationMs as number}ms</p>
              </div>
            )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-600 mb-0.5">{label}</p>
      <p className="text-xs text-zinc-300 break-all">{value}</p>
    </div>
  )
}

const LOGO_SOURCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  brandfetch: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Brandfetch' },
  'brandfetch-lettermark': { bg: 'bg-blue-500/10', text: 'text-blue-300', label: 'Brandfetch LM' },
  website: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Website' },
  instagram: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Instagram' },
  gmaps: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'GMaps' },
  favicon: { bg: 'bg-zinc-700', text: 'text-zinc-400', label: 'Favicon' },
  generated: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Generiert' },
}

function LogoSourceBadge({ source }: { source: string }) {
  const style = LOGO_SOURCE_STYLES[source] || LOGO_SOURCE_STYLES.generated
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}
