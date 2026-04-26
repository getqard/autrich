'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Search, Loader2, Download, Check, Filter, X,
  ExternalLink, AlertCircle, CheckCircle2, Link2,
  Square, RefreshCw,
} from 'lucide-react'
import type { Industry, ScrapeResultRaw } from '@/lib/supabase/types'

type CampaignOption = {
  id: string
  name: string
}

type ResultWithDedup = ScrapeResultRaw & {
  is_duplicate: boolean
  is_chain_duplicate: boolean
  chain_domain: string | null
  chain_kept_name: string | null
  chain_size: number | null
}

type Summary = {
  total: number
  passes_filter: number
  duplicates: number
  chain_duplicates: number
  chains_detected: number
}

type ScrapeState =
  | { phase: 'idle' }
  | { phase: 'scraping'; jobId: string; previewCount?: number; startedAt: string; pollingError?: string }
  | { phase: 'storing'; jobId: string }
  | { phase: 'results'; jobId: string; results: ResultWithDedup[]; summary: Summary }
  | { phase: 'cancelled'; jobId: string }
  | { phase: 'error'; message: string; jobId?: string; canRetry?: boolean }

function getPollingInterval(elapsedMs: number): number {
  if (elapsedMs < 2 * 60_000) return 3_000       // 0-2 min: 3s
  if (elapsedMs < 10 * 60_000) return 10_000      // 2-10 min: 10s
  if (elapsedMs < 60 * 60_000) return 30_000      // 10-60 min: 30s
  return 0 // stop
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min === 0) return `${sec} Sek`
  return `${min} Min ${sec} Sek`
}

function ScrapingPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [industries, setIndustries] = useState<Industry[]>([])
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [selectedIndustry, setSelectedIndustry] = useState('')
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [city, setCity] = useState('')
  const [maxResults, setMaxResults] = useState('')
  const [extractionMethod, setExtractionMethod] = useState('fast')

  // Filters — Defaults laut MASTERPLAN: ≥4.5★ und ≥200 Reviews (Lano-Vorgabe).
  // Wer weichere Kampagnen will, kann manuell runter setzen.
  const [minRating, setMinRating] = useState('4.5')
  const [minReviews, setMinReviews] = useState('200')
  const [hasWebsite, setHasWebsite] = useState(true)
  const [hasPhone, setHasPhone] = useState(false)
  const [enableEnrichment, setEnableEnrichment] = useState(false)

  const [state, setState] = useState<ScrapeState>({ phase: 'idle' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showFiltered, setShowFiltered] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    imported: number
    skipped: number
    importedWithoutEmail: number
    skippedDuplicates: number
    skippedMissingContact: number
    campaignId: string | null
    campaignName: string | null
    totalLeadsAfter: number | null
  } | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<number>(0)

  // --- Helpers ---

  function setJobIdInUrl(jobId: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (jobId) params.set('jobId', jobId)
    else params.delete('jobId')

    const query = params.toString()
    router.replace(query ? `?${query}` : '?', { scroll: false })
  }

  const loadResults = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/scraping/search/${jobId}/results`)
      const data = await res.json()
      setState({
        phase: 'results',
        jobId,
        results: data.results || [],
        summary: data.summary || { total: 0, passes_filter: 0, duplicates: 0, chain_duplicates: 0, chains_detected: 0 },
      })
      // Auto-select filtered, non-duplicate, non-chain results
      const autoSelected = new Set<string>(
        (data.results || [])
          .filter((r: ResultWithDedup) => r.passes_filter && !r.is_duplicate && !r.is_chain_duplicate)
          .map((r: ResultWithDedup) => r.id)
      )
      setSelected(autoSelected)
    } catch {
      setState({ phase: 'error', message: 'Ergebnisse konnten nicht geladen werden', jobId, canRetry: true })
    }
  }, [])

  const storeAndLoad = useCallback(async (jobId: string) => {
    setState({ phase: 'storing', jobId })
    try {
      const storeRes = await fetch(`/api/scraping/search/${jobId}/store`, { method: 'POST' })
      const storeData = await storeRes.json()
      if (!storeRes.ok) {
        setState({ phase: 'error', message: storeData.error || 'Speichern fehlgeschlagen', jobId, canRetry: true })
        return
      }
      await loadResults(jobId)
    } catch (e) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : 'Netzwerkfehler beim Speichern', jobId, canRetry: true })
    }
  }, [loadResults])

  // --- Polling ---

  const poll = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/scraping/search/${jobId}/status`)
      const data = await res.json()

      if (data.status === 'completed' && data.needs_store) {
        stopElapsedTimer()
        await storeAndLoad(jobId)
        return
      }

      if (data.status === 'completed' && !data.needs_store) {
        stopElapsedTimer()
        await loadResults(jobId)
        return
      }

      if (data.status === 'failed') {
        stopElapsedTimer()
        setState({ phase: 'error', message: data.error || 'Scrape fehlgeschlagen', jobId, canRetry: true })
        return
      }

      if (data.status === 'cancelled') {
        stopElapsedTimer()
        setState({ phase: 'cancelled', jobId })
        return
      }

      // Still running — update state + schedule next poll
      setState(prev => {
        if (prev.phase !== 'scraping') return prev
        return {
          ...prev,
          previewCount: data.preview_count ?? prev.previewCount,
          pollingError: data.error || undefined,
        }
      })

      // Schedule next poll with backoff
      const elapsed = Date.now() - startedAtRef.current
      const interval = getPollingInterval(elapsed)
      if (interval === 0) {
        // Max timeout reached
        setState(prev => prev.phase === 'scraping'
          ? { ...prev, pollingError: 'Scrape dauert ungewöhnlich lang. Evtl. hängt der Task.' }
          : prev
        )
        return
      }
      pollingTimeoutRef.current = setTimeout(() => poll(jobId), interval)
    } catch (e) {
      // Network error — keep polling with warning
      setState(prev => {
        if (prev.phase !== 'scraping') return prev
        return { ...prev, pollingError: e instanceof Error ? e.message : 'Netzwerkfehler' }
      })
      pollingTimeoutRef.current = setTimeout(() => poll(jobId), 5000)
    }
  }, [storeAndLoad, loadResults])

  function startPolling(jobId: string, startedAt: string) {
    startedAtRef.current = new Date(startedAt).getTime() || Date.now()
    setElapsedMs(Date.now() - startedAtRef.current)

    // Elapsed timer
    elapsedIntervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current)
    }, 1000)

    // First poll
    pollingTimeoutRef.current = setTimeout(() => poll(jobId), 2000)
  }

  function stopPolling() {
    if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current)
    pollingTimeoutRef.current = null
  }

  function stopElapsedTimer() {
    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)
    elapsedIntervalRef.current = null
  }

  function stopAll() {
    stopPolling()
    stopElapsedTimer()
  }

  // Cleanup on unmount
  useEffect(() => () => stopAll(), [])

  // Start/stop polling when state changes
  useEffect(() => {
    if (state.phase === 'scraping') {
      startPolling(state.jobId, state.startedAt)
    } else {
      stopAll()
    }
    return () => stopAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.phase === 'scraping' ? state.jobId : null])

  // --- Load industries ---
  useEffect(() => {
    fetch('/api/industries')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setIndustries(data)
      })

    fetch('/api/campaigns')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCampaigns(data.map((campaign: CampaignOption) => ({
            id: campaign.id,
            name: campaign.name,
          })))
        }
      })
  }, [])

  // Tracking ob die Campaign-Auswahl aus der URL kam — damit wir den Selector
  // sperren und der User nicht versehentlich auf "Globaler Pool" zurückwechselt.
  const urlCampaignId = searchParams.get('campaign_id')
  useEffect(() => {
    if (urlCampaignId) setSelectedCampaignId(urlCampaignId)
  }, [urlCampaignId])

  // --- Reconnect on page load ---
  useEffect(() => {
    const jobId = searchParams.get('jobId')
    if (!jobId) return

    // Check job status and set appropriate state
    fetch(`/api/scraping/search/${jobId}/status`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'running') {
          setState({ phase: 'scraping', jobId, startedAt: data.started_at || new Date().toISOString(), previewCount: data.preview_count })
        } else if (data.status === 'completed' && data.needs_store) {
          storeAndLoad(jobId)
        } else if (data.status === 'completed') {
          loadResults(jobId)
        } else if (data.status === 'failed') {
          setState({ phase: 'error', message: data.error || 'Scrape fehlgeschlagen', jobId, canRetry: true })
        } else if (data.status === 'cancelled') {
          setState({ phase: 'cancelled', jobId })
        }
      })
      .catch(() => {
        // If status check fails, just go idle
        setJobIdInUrl(null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Actions ---

  async function startScrape() {
    if (!city.trim()) return

    setImportResult(null)

    try {
      const res = await fetch('/api/scraping/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry_id: industries.find(i => `${i.emoji} ${i.name}` === selectedIndustry)?.id || undefined,
          custom_business_type: industries.find(i => `${i.emoji} ${i.name}` === selectedIndustry) ? undefined : (selectedIndustry.trim() || undefined),
          city: city.trim(),
          max_results: maxResults ? parseInt(maxResults) : undefined,
          extraction_method: extractionMethod,
          enable_enrichment: enableEnrichment,
          quality_filter: {
            min_rating: parseFloat(minRating) || undefined,
            min_reviews: parseInt(minReviews) || undefined,
            has_website: hasWebsite || undefined,
            has_phone: hasPhone || undefined,
          },
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setState({ phase: 'error', message: data.error || 'Fehler beim Starten' })
        return
      }

      const startedAt = data.started_at || new Date().toISOString()
      setState({ phase: 'scraping', jobId: data.job_id, startedAt })
      setJobIdInUrl(data.job_id)
    } catch (e) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : 'Netzwerkfehler' })
    }
  }

  async function cancelScrape() {
    if (state.phase !== 'scraping') return
    const jobId = state.jobId
    stopAll()
    try {
      await fetch(`/api/scraping/search/${jobId}/cancel`, { method: 'POST' })
    } catch {
      // Best effort
    }
    setState({ phase: 'cancelled', jobId })
  }

  function reset() {
    stopAll()
    setState({ phase: 'idle' })
    setSelected(new Set())
    setImportResult(null)
    setJobIdInUrl(null)
  }

  function retryFromError() {
    if (state.phase !== 'error' || !state.jobId) return
    const jobId = state.jobId
    setState({ phase: 'scraping', jobId, startedAt: new Date().toISOString() })
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (state.phase !== 'results') return
    const filteredResults = getVisibleResults()
    const selectableResults = filteredResults.filter(r => !r.is_duplicate && !r.is_chain_duplicate && !r.imported)
    const allSelected = selectableResults.every(r => selected.has(r.id))
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableResults.map(r => r.id)))
    }
  }

  function getVisibleResults(): ResultWithDedup[] {
    if (state.phase !== 'results') return []
    return showFiltered
      ? state.results.filter(r => r.passes_filter)
      : state.results
  }

  async function importSelected() {
    if (state.phase !== 'results' || selected.size === 0) return
    setImporting(true)

    try {
      const res = await fetch(`/api/scraping/search/${state.jobId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result_ids: Array.from(selected),
          campaign_id: selectedCampaignId || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setImportResult({
          imported: data.imported || 0,
          skipped: data.skipped || data.duplicates || 0,
          importedWithoutEmail: data.imported_without_email || 0,
          skippedDuplicates: data.skipped_duplicates || data.duplicates || 0,
          skippedMissingContact: data.skipped_missing_contact || 0,
          campaignId: data.campaign_id || null,
          campaignName: data.campaign_name || null,
          totalLeadsAfter: data.total_leads_after ?? null,
        })
        await loadResults(state.jobId)
        setSelected(new Set())

        // Wenn Import in eine Campaign ging und Leads tatsächlich landeten:
        // direkt zurück zur Kampagne, damit der User seine Leads sofort sieht.
        if (data.campaign_id && (data.imported || 0) > 0) {
          setTimeout(() => router.push(`/campaigns/${data.campaign_id}`), 1500)
        }
      } else {
        alert(`Import fehlgeschlagen: ${data.error}`)
      }
    } catch {
      alert('Netzwerkfehler beim Import')
    }
    setImporting(false)
  }

  function exportCSV() {
    if (state.phase !== 'results') return
    const visible = getVisibleResults()
    const headers = ['Name', 'Adresse', 'Stadt', 'Telefon', 'Website', 'Email', 'Rating', 'Reviews', 'Kategorie']
    const rows = visible.map(r => [
      r.name, r.address || '', r.city || '', r.phone || '', r.website || '',
      r.email || '', r.rating?.toString() || '', r.reviews_count?.toString() || '', r.category || '',
    ])
    const csv = [headers, ...rows].map(row => row.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scrape-${city.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const visibleResults = getVisibleResults()

  const targetCampaign = campaigns.find((c) => c.id === selectedCampaignId)

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Manuelles Scraping</h2>
      <p className="text-zinc-400 text-sm mb-4">
        Eine Branche + eine Stadt scrapen, Ergebnisse inspizieren, filtern und importieren.
      </p>

      {targetCampaign && (
        <div className="mb-6 px-4 py-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm flex items-center justify-between">
          <span>
            Import-Ziel: <strong className="text-white">{targetCampaign.name}</strong>
            <span className="text-zinc-500"> · gefundene Leads landen direkt in dieser Kampagne</span>
          </span>
          {!urlCampaignId && (
            <button
              onClick={() => setSelectedCampaignId('')}
              className="text-xs text-zinc-500 hover:text-white"
            >
              Andere wählen
            </button>
          )}
        </div>
      )}

      {/* Search Form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">
              Kampagne {urlCampaignId && <span className="text-blue-400">(durch Link festgelegt)</span>}
            </label>
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              disabled={!!urlCampaignId}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">Globaler Lead-Pool (ohne Kampagne)</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Branche</label>
            <input
              type="text"
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              list="industry-list"
              placeholder="z.B. Bäckerei, Restaurant, Barber..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <datalist id="industry-list">
              {industries.map(ind => (
                <option key={ind.id} value={`${ind.emoji} ${ind.name}`} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Stadt oder PLZ-Liste</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="z.B. Nürnberg oder 90402, 90403, 90404..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
              onKeyDown={(e) => e.key === 'Enter' && startScrape()}
            />
            {city.split(/[,;\n]+/).filter(s => /^\d{4,5}$/.test(s.trim())).length > 1 && (
              <p className="text-[10px] text-blue-400 mt-1">
                Bulk-PLZ erkannt: {city.split(/[,;\n]+/).filter(s => /^\d{4,5}$/.test(s.trim())).length} PLZ → je eine Suche pro PLZ
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Max. Ergebnisse</label>
            <input
              type="number"
              value={maxResults}
              onChange={(e) => setMaxResults(e.target.value)}
              placeholder="Standard: alle"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
        </div>

        {/* Extraction Method */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Suchmethode</label>
            <select
              value={extractionMethod}
              onChange={(e) => setExtractionMethod(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
            >
              <option value="fastest">Fastest (~30s, weniger Ergebnisse)</option>
              <option value="fast">Fast (1-10 Min, ~120-1600 Ergebnisse)</option>
              <option value="detailed">Detailed (langsamer, mehr Ergebnisse)</option>
              <option value="zoom_15">Zoom 15 — Stadtteil</option>
              <option value="zoom_16">Zoom 16 — Sub-Stadtteil</option>
              <option value="zoom_17">Zoom 17 — Block (zeitintensiv)</option>
              <option value="zoom_18">Zoom 18 — Straße (sehr zeitintensiv, tausende Ergebnisse)</option>
            </select>
          </div>
        </div>

        {/* Quality Filter */}
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-3">
          <Filter size={12} />
          Qualitäts-Filter:
        </div>
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">Min. Rating:</label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="5"
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
              className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">Min. Reviews:</label>
            <input
              type="number"
              min="0"
              value={minReviews}
              onChange={(e) => setMinReviews(e.target.value)}
              className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={hasWebsite}
              onChange={(e) => setHasWebsite(e.target.checked)}
              className="rounded border-zinc-600"
            />
            Hat Website
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={hasPhone}
              onChange={(e) => setHasPhone(e.target.checked)}
              className="rounded border-zinc-600"
            />
            Hat Telefon
          </label>
          <div className="w-px h-4 bg-zinc-700" />
          <label className="flex items-center gap-2 text-xs cursor-pointer" title="Emails + Social Links von Websites extrahieren (Omkar API, 1 Credit/Lead)">
            <input
              type="checkbox"
              checked={enableEnrichment}
              onChange={(e) => setEnableEnrichment(e.target.checked)}
              className="rounded border-zinc-600"
            />
            <span className={enableEnrichment ? 'text-blue-400' : 'text-zinc-400'}>
              Email-Enrichment
            </span>
          </label>
        </div>

        <button
          onClick={startScrape}
          disabled={!city.trim() || state.phase === 'scraping' || state.phase === 'storing'}
          className="flex items-center gap-2 px-4 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {state.phase === 'scraping' || state.phase === 'storing'
            ? <Loader2 size={16} className="animate-spin" />
            : <Search size={16} />
          }
          {state.phase === 'scraping' ? 'Scraping läuft...' : state.phase === 'storing' ? 'Wird gespeichert...' : 'Jetzt Scrapen'}
        </button>
      </div>

      {/* Scraping in progress */}
      {state.phase === 'scraping' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <Loader2 size={32} className="mx-auto mb-3 animate-spin text-white" />
          <p className="text-sm">Scraping läuft...</p>
          <p className="text-xs text-zinc-400 mt-2">
            {formatElapsed(elapsedMs)} vergangen
            {state.previewCount ? ` · ~${state.previewCount} Ergebnisse bisher` : ''}
          </p>
          {state.pollingError && (
            <p className="text-xs text-amber-400/80 mt-2 flex items-center justify-center gap-1">
              <AlertCircle size={11} /> {state.pollingError}
            </p>
          )}
          <button
            onClick={cancelScrape}
            className="mt-4 flex items-center gap-1.5 mx-auto px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Square size={11} /> Abbrechen
          </button>
        </div>
      )}

      {/* Storing results */}
      {state.phase === 'storing' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <Loader2 size={32} className="mx-auto mb-3 animate-spin text-white" />
          <p className="text-sm">Ergebnisse werden verarbeitet und gespeichert...</p>
          <p className="text-xs text-zinc-500 mt-2">Ketten-Erkennung läuft, kann einen Moment dauern.</p>
        </div>
      )}

      {/* Cancelled */}
      {state.phase === 'cancelled' && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-6 flex items-start gap-3">
          <Square size={20} className="text-zinc-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-zinc-300 font-medium">Scrape abgebrochen</p>
            <p className="text-xs text-zinc-500 mt-1">Der Scrape-Vorgang wurde gestoppt.</p>
            <button onClick={reset} className="text-xs text-zinc-400 hover:text-white mt-2">
              Zurücksetzen
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {state.phase === 'error' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-400 font-medium">Fehler</p>
            <p className="text-xs text-red-400/70 mt-1">{state.message}</p>
            <div className="flex gap-3 mt-3">
              {state.canRetry && state.jobId && (
                <button
                  onClick={retryFromError}
                  className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white"
                >
                  <RefreshCw size={11} /> Erneut versuchen
                </button>
              )}
              <button
                onClick={reset}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Zurücksetzen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Result */}
      {importResult && (
        <div className={`rounded-xl p-4 mb-4 border ${
          importResult.campaignId
            ? 'bg-green-500/10 border-green-500/30'
            : importResult.imported > 0
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-zinc-800 border-zinc-700'
        }`}>
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className={importResult.campaignId ? 'text-green-400 mt-0.5' : 'text-amber-400 mt-0.5'} />
            <div className="flex-1">
              <p className={`text-sm font-medium ${importResult.campaignId ? 'text-green-300' : 'text-amber-300'}`}>
                {importResult.imported} Leads importiert
                {importResult.campaignName && ` in Kampagne "${importResult.campaignName}"`}
                {!importResult.campaignId && importResult.imported > 0 && ' in Globalen Lead-Pool (keine Kampagne ausgewählt!)'}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                {importResult.importedWithoutEmail > 0 && `${importResult.importedWithoutEmail} ohne E-Mail · `}
                {importResult.skippedDuplicates > 0 && `${importResult.skippedDuplicates} Duplikate · `}
                {importResult.skippedMissingContact > 0 && `${importResult.skippedMissingContact} ohne Kontakt/Website · `}
                {importResult.totalLeadsAfter !== null && `Kampagne hat jetzt ${importResult.totalLeadsAfter} Leads gesamt`}
              </p>
              {importResult.campaignId && importResult.imported > 0 && (
                <p className="text-xs text-zinc-500 mt-1">→ Du wirst gleich zur Kampagne weitergeleitet…</p>
              )}
              {!importResult.campaignId && importResult.imported > 0 && (
                <p className="text-xs text-amber-400 mt-1">
                  ⚠ Diese Leads sind nicht mit einer Kampagne verknüpft. Falls du das wolltest:
                  oben Kampagne auswählen und nochmal importieren (oder Leads manuell zuweisen).
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {state.phase === 'results' && (
        <div>
          {/* Summary + Actions */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <p className="text-sm">
                <span className="text-white font-medium">{state.summary.total}</span>
                <span className="text-zinc-500"> Ergebnisse</span>
                {state.summary.chains_detected > 0 && (
                  <>
                    <span className="text-zinc-600 mx-1">·</span>
                    <span className="text-orange-400">{state.summary.chain_duplicates}</span>
                    <span className="text-zinc-500"> Ketten-Duplikate ({state.summary.chains_detected} Ketten)</span>
                  </>
                )}
                {state.summary.passes_filter < state.summary.total && (
                  <>
                    <span className="text-zinc-600 mx-1">·</span>
                    <span className="text-green-400">{state.summary.passes_filter}</span>
                    <span className="text-zinc-500"> bestehen Filter</span>
                  </>
                )}
                {state.summary.duplicates > 0 && (
                  <>
                    <span className="text-zinc-600 mx-1">·</span>
                    <span className="text-amber-400">{state.summary.duplicates}</span>
                    <span className="text-zinc-500"> Duplikate</span>
                  </>
                )}
              </p>

              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showFiltered}
                  onChange={(e) => setShowFiltered(e.target.checked)}
                  className="rounded border-zinc-600"
                />
                Nur gefilterte zeigen
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-lg text-xs hover:bg-zinc-700"
              >
                <Download size={12} /> CSV Export
              </button>
              <button
                onClick={importSelected}
                disabled={selected.size === 0 || importing}
                className="flex items-center gap-1.5 px-3 py-2 bg-white text-black rounded-lg text-xs font-medium hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {importing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {selected.size} ausgewählte importieren
              </button>
            </div>
          </div>

          {/* Results Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                  <th className="text-left px-3 py-3 font-medium w-10">
                    <input
                      type="checkbox"
                      checked={visibleResults.length > 0 && visibleResults.filter(r => !r.is_duplicate && !r.is_chain_duplicate && !r.imported).every(r => selected.has(r.id))}
                      onChange={selectAll}
                      className="rounded border-zinc-600"
                    />
                  </th>
                  <th className="text-left px-3 py-3 font-medium">Name</th>
                  <th className="text-left px-3 py-3 font-medium">Stadt</th>
                  <th className="text-left px-3 py-3 font-medium">Rating</th>
                  <th className="text-left px-3 py-3 font-medium">Reviews</th>
                  <th className="text-left px-3 py-3 font-medium">Website</th>
                  <th className="text-left px-3 py-3 font-medium">Email</th>
                  <th className="text-left px-3 py-3 font-medium">Telefon</th>
                  <th className="text-left px-3 py-3 font-medium">Kategorie</th>
                  <th className="text-left px-3 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleResults.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-zinc-800/50 transition-colors ${
                      r.is_duplicate || r.is_chain_duplicate ? 'opacity-40' :
                      r.imported ? 'bg-green-500/5' :
                      selected.has(r.id) ? 'bg-white/5' :
                      'hover:bg-zinc-800/30'
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        disabled={r.is_duplicate || r.is_chain_duplicate || r.imported}
                        className="rounded border-zinc-600 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{r.name}</span>
                      {r.address && (
                        <span className="block text-[10px] text-zinc-600 truncate max-w-[200px]">{r.address}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs">{r.city || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {r.rating ? (
                        <span className={r.rating >= 4 ? 'text-green-400' : r.rating >= 3 ? 'text-amber-400' : 'text-red-400'}>
                          {r.rating.toFixed(1)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs">{r.reviews_count || 0}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {r.website ? (
                        <a href={r.website.startsWith('http') ? r.website : `https://${r.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                          <ExternalLink size={10} />
                          <span className="truncate max-w-[100px]">{r.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                        </a>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {r.email ? (
                        <span className="text-green-400 truncate max-w-[120px] block">{r.email}</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs">{r.phone || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs truncate max-w-[120px]">{r.category || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {r.imported ? (
                        <span className="text-green-400 flex items-center gap-1"><CheckCircle2 size={11} /> Importiert</span>
                      ) : r.is_duplicate ? (
                        <span className="text-amber-400">Duplikat</span>
                      ) : r.is_chain_duplicate ? (
                        <span className="text-orange-400 flex items-center gap-1" title={`Gleiche Website wie ${r.chain_kept_name} — Standort mit meisten Bewertungen behalten`}>
                          <Link2 size={11} /> Kette{r.chain_size ? ` (${r.chain_size})` : ''}
                        </span>
                      ) : !r.passes_filter ? (
                        <span className="text-zinc-600">Gefiltert</span>
                      ) : !r.email ? (
                        <span className="text-zinc-500">Keine E-Mail</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Back to idle */}
          <div className="mt-4">
            <button onClick={reset} className="text-xs text-zinc-500 hover:text-white">
              Neuen Scrape starten
            </button>
          </div>
        </div>
      )}

      {/* Idle state */}
      {state.phase === 'idle' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <Search size={32} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-500 text-sm">
            Wähle eine Branche und Stadt, dann klicke auf &quot;Jetzt Scrapen&quot;.
          </p>
        </div>
      )}
    </div>
  )
}

export default function ManualScrapingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-zinc-500">Laden...</div>}>
      <ScrapingPageInner />
    </Suspense>
  )
}
