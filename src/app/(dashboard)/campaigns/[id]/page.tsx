'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Upload, Loader2, CheckCircle2, XCircle,
  AlertTriangle, FileSpreadsheet, Users, Play, Square,
  Zap, ClipboardCheck, Filter, Layers, Search, Download,
} from 'lucide-react'

type CampaignDetail = {
  id: string
  name: string
  status: string
  total_leads: number
  processed_leads: number
  created_at: string
  stats?: {
    total: number
    enrichment: Record<string, number>
    pass: Record<string, number>
    email: Record<string, number>
    pipeline: Record<string, number>
  }
}

type UploadResult = {
  success: boolean
  summary: {
    total_rows: number
    valid: number
    invalid: number
    duplicates: number
    blacklisted: number
    parse_errors: number
  }
  validation_errors: Array<{ row: number; email: string; message: string }>
  duplicates: Array<{ row: number; email: string; message: string }>
  blacklisted: Array<{ row: number; email: string }>
  parse_errors: Array<{ row: number; message: string }>
  detected_headers: string[]
}

export default function CampaignDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Batch Pipeline state
  type BatchProgress = {
    status: 'idle' | 'running' | 'completed' | 'failed'
    total: number
    completed: number
    failed: number
    current_lead_name?: string
    current_phase?: 'enrichment' | 'pass_email'
    leads?: {
      total: number
      pending: number
      ready_for_review: number
      awaiting_triage?: number
      enrichment_queue?: number
      awaiting_enrichment_review?: number
      pass_email_queue?: number
    }
    remaining?: number
    failed_leads?: Array<{ id: string; name: string; error: string; phase?: string }>
  }
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)

  const loadBatchProgress = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}/batch-pipeline`)
    if (res.ok) {
      const data = await res.json()
      setBatchProgress(data)
      return data as BatchProgress
    }
    return null
  }, [id])

  async function startBatch() {
    setBatchLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/batch-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const data = await res.json()
      setBatchProgress(data)
    } catch {
      // ignore
    }
    setBatchLoading(false)
  }

  async function continueBatch() {
    const res = await fetch(`/api/campaigns/${id}/batch-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'continue' }),
    })
    if (res.ok) {
      const data = await res.json()
      setBatchProgress(data)
    }
  }

  async function stopBatch() {
    await fetch(`/api/campaigns/${id}/batch-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    })
    await loadBatchProgress()
  }

  // Poll batch progress + auto-continue
  useEffect(() => {
    if (!batchProgress || batchProgress.status !== 'running') return

    const interval = setInterval(async () => {
      const progress = await loadBatchProgress()
      if (progress?.status === 'running' && (progress.remaining ?? 1) > 0) {
        // Trigger next chunk
        continueBatch()
      }
      if (progress?.status === 'completed' || progress?.status === 'idle') {
        loadCampaign()
      }
    }, 5000)

    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchProgress?.status])

  // Initial batch progress load
  useEffect(() => {
    if (campaign && campaign.total_leads > 0) {
      loadBatchProgress()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id])

  const loadCampaign = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}`)
    if (res.ok) {
      const data = await res.json()
      setCampaign(data)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    loadCampaign()
  }, [loadCampaign])

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadResult(null)
    setUploadError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/campaigns/${id}/upload`, {
        method: 'POST',
        body: formData,
      })

      const result = await res.json()

      if (result.error && !result.summary) {
        // Fatal error (no summary = couldn't parse at all)
        setUploadError(result.error)
      } else {
        setUploadResult(result)
      }

      loadCampaign()
    } catch {
      setUploadError('Netzwerkfehler beim Upload')
    }

    setUploading(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!campaign) {
    return <p className="text-zinc-500">Kampagne nicht gefunden.</p>
  }

  return (
    <div>
      <Link href="/campaigns" className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm mb-6">
        <ArrowLeft size={16} /> Alle Campaigns
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold">{campaign.name}</h2>
          <p className="text-zinc-400 text-sm mt-1">
            {campaign.total_leads} Leads · Status: {campaign.status} · {new Date(campaign.created_at).toLocaleDateString('de-DE')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/scraping?campaign_id=${campaign.id}`}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700 transition-colors"
          >
            <Search size={16} /> Mit Scraping befüllen
          </Link>
          {campaign.total_leads > 0 && (
            <>
              <Link
                href={`/leads?campaign_id=${campaign.id}`}
                className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700 transition-colors"
              >
                <Users size={16} /> Leads ansehen
              </Link>
              <a
                href={`/api/leads/export?campaign_id=${campaign.id}&format=xlsx`}
                className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700 transition-colors"
                title="Alle Leads dieser Kampagne als Excel"
              >
                <Download size={16} /> Export
              </a>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      {campaign.stats && campaign.stats.total > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {Object.entries(campaign.stats.pipeline).map(([status, count]) => (
            count > 0 ? (
              <div key={status} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <div className="text-lg font-bold">{count}</div>
                <div className="text-xs text-zinc-500">{status}</div>
              </div>
            ) : null
          ))}
        </div>
      )}

      {/* CSV Upload Zone */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <FileSpreadsheet size={18} /> CSV / Excel Upload
        </h3>

        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            dragOver
              ? 'border-white bg-zinc-800/50'
              : 'border-zinc-700 hover:border-zinc-500'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="animate-spin text-zinc-400" />
              <p className="text-zinc-400">Datei wird verarbeitet...</p>
            </div>
          ) : (
            <>
              <Upload size={32} className="mx-auto text-zinc-600 mb-3" />
              <p className="text-zinc-400 mb-2">CSV oder Excel Datei hierhin ziehen</p>
              <p className="text-zinc-600 text-sm mb-4">
                Spalten: Name, Email, Website, Branche, Stadt, Telefon, Kontakt, Instagram
              </p>
              <label className="inline-block px-4 py-2 bg-zinc-800 rounded-lg text-sm cursor-pointer hover:bg-zinc-700 transition-colors">
                Datei auswählen
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Upload Error */}
      {uploadError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 mb-6">
          <h3 className="font-semibold text-red-400 flex items-center gap-2 mb-2">
            <XCircle size={18} /> Upload fehlgeschlagen
          </h3>
          <p className="text-sm text-red-300">{uploadError}</p>
          <p className="text-xs text-zinc-500 mt-3">
            Stelle sicher dass die Datei mindestens die Spalten &quot;Name&quot; (oder &quot;Ladenname&quot;, &quot;Business&quot;, &quot;Firma&quot;)
            und &quot;Email&quot; (oder &quot;E-Mail&quot;, &quot;Mail&quot;) enthält.
          </p>
        </div>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold mb-4">
            {uploadResult.success ? (
              <span className="flex items-center gap-2 text-green-400">
                <CheckCircle2 size={18} /> Upload erfolgreich
              </span>
            ) : (
              <span className="flex items-center gap-2 text-red-400">
                <XCircle size={18} /> Upload fehlgeschlagen
              </span>
            )}
          </h3>

          {uploadResult.summary && (
            <div className="grid grid-cols-5 gap-3 mb-6">
              <div className="bg-zinc-800 rounded-lg p-3 text-center">
                <div className="text-lg font-bold">{uploadResult.summary.total_rows}</div>
                <div className="text-xs text-zinc-500">Gesamt</div>
              </div>
              <div className="bg-green-500/10 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-green-400">{uploadResult.summary.valid}</div>
                <div className="text-xs text-zinc-500">Valide</div>
              </div>
              <div className="bg-red-500/10 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-red-400">{uploadResult.summary.invalid}</div>
                <div className="text-xs text-zinc-500">Ungültig</div>
              </div>
              <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-yellow-400">{uploadResult.summary.duplicates}</div>
                <div className="text-xs text-zinc-500">Duplikate</div>
              </div>
              <div className="bg-zinc-800 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-zinc-400">{uploadResult.summary.blacklisted}</div>
                <div className="text-xs text-zinc-500">Blacklisted</div>
              </div>
            </div>
          )}

          {/* Detected Headers */}
          {uploadResult.detected_headers && (
            <div className="mb-4">
              <p className="text-xs text-zinc-500 mb-2">Erkannte Spalten:</p>
              <div className="flex flex-wrap gap-1.5">
                {uploadResult.detected_headers.map((h) => (
                  <span key={h} className="text-xs bg-zinc-800 px-2 py-1 rounded">{h}</span>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {uploadResult.validation_errors && uploadResult.validation_errors.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-red-400 mb-2 flex items-center gap-1">
                <AlertTriangle size={12} /> Ungültige Einträge
              </p>
              <div className="bg-zinc-800 rounded-lg p-3 max-h-40 overflow-auto">
                {uploadResult.validation_errors.slice(0, 20).map((e, i) => (
                  <div key={i} className="text-xs text-zinc-400 py-1">
                    Zeile {e.row}: {e.email} — {e.message}
                  </div>
                ))}
                {uploadResult.validation_errors.length > 20 && (
                  <div className="text-xs text-zinc-600 mt-1">
                    ... und {uploadResult.validation_errors.length - 20} weitere
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Duplicates */}
          {uploadResult.duplicates && uploadResult.duplicates.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-yellow-400 mb-2 flex items-center gap-1">
                <AlertTriangle size={12} /> Duplikate (übersprungen)
              </p>
              <div className="bg-zinc-800 rounded-lg p-3 max-h-40 overflow-auto">
                {uploadResult.duplicates.slice(0, 20).map((d, i) => (
                  <div key={i} className="text-xs text-zinc-400 py-1">
                    Zeile {d.row}: {d.email} — {d.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Batch Pipeline ═══ */}
      {campaign.total_leads > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mt-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Zap size={18} /> Batch Pipeline
          </h3>

          {/* Progress Bar */}
          {batchProgress && batchProgress.status !== 'idle' && batchProgress.total > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-zinc-400">
                  {batchProgress.completed + batchProgress.failed} / {batchProgress.total} verarbeitet
                  {batchProgress.current_lead_name && batchProgress.status === 'running' && (
                    <span className="text-zinc-600"> — {batchProgress.current_lead_name}</span>
                  )}
                </span>
                <span className="text-zinc-500">
                  {batchProgress.failed > 0 && (
                    <span className="text-red-400">{batchProgress.failed} Fehler</span>
                  )}
                </span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    batchProgress.status === 'completed' ? 'bg-green-500' :
                    batchProgress.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${batchProgress.total > 0 ? ((batchProgress.completed + batchProgress.failed) / batchProgress.total * 100) : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Status Messages */}
          {batchProgress?.status === 'completed' && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-4">
              <p className="text-green-400 text-sm flex items-center gap-2">
                <CheckCircle2 size={16} />
                Pipeline abgeschlossen: {batchProgress.completed} erfolgreich
                {batchProgress.failed > 0 && `, ${batchProgress.failed} fehlgeschlagen`}
              </p>
            </div>
          )}

          {/* Failed Leads */}
          {batchProgress?.failed_leads && batchProgress.failed_leads.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 max-h-32 overflow-auto">
              <p className="text-xs text-red-400 mb-2">Fehlgeschlagene Leads:</p>
              {batchProgress.failed_leads.map((fl, i) => (
                <div key={i} className="text-xs text-zinc-400 py-0.5">
                  {fl.name}: {fl.error}
                </div>
              ))}
            </div>
          )}

          {/* Lead Counts */}
          {batchProgress?.leads && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-zinc-800 rounded-lg p-3 text-center">
                <div className="text-lg font-bold">{batchProgress.leads.total}</div>
                <div className="text-xs text-zinc-500">Gesamt</div>
              </div>
              <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-yellow-400">{batchProgress.leads.pending}</div>
                <div className="text-xs text-zinc-500">Ausstehend</div>
              </div>
              <div className="bg-green-500/10 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-green-400">{batchProgress.leads.ready_for_review}</div>
                <div className="text-xs text-zinc-500">Bereit zum Review</div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {(!batchProgress || batchProgress.status === 'idle' || batchProgress.status === 'completed') && (
              <button
                onClick={startBatch}
                disabled={batchLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {batchLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {batchProgress?.status === 'completed' ? 'Nochmal starten' : 'Pipeline starten'}
              </button>
            )}

            {batchProgress?.status === 'running' && (
              <button
                onClick={stopBatch}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
              >
                <Square size={16} /> Stoppen
              </button>
            )}

            {batchProgress?.status === 'running' && (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 size={14} className="animate-spin" /> Wird verarbeitet...
              </div>
            )}

          </div>
        </div>
      )}

      {/* ═══ Swipe-Stages (Block 3) ═══ */}
      {campaign.total_leads > 0 && batchProgress?.leads && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mt-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Layers size={18} /> Swipe-Stages
          </h3>
          <p className="text-xs text-zinc-500 mb-4">
            Leads durchlaufen 3 Stages mit manueller Freigabe. Batch-Pipeline verarbeitet nur approved Leads.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Stage 1 — Triage */}
            <Link
              href={`/campaigns/${id}/triage`}
              className={`group flex flex-col gap-2 p-4 rounded-lg border transition-colors ${
                (batchProgress.leads.awaiting_triage ?? 0) > 0
                  ? 'bg-blue-600/10 border-blue-500/30 hover:bg-blue-600/20'
                  : 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-blue-400" />
                <span className="text-xs text-zinc-400 font-medium">Stage 1</span>
              </div>
              <div>
                <p className="text-sm font-semibold">Triage</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Vor Enrichment · spart Tokens</p>
              </div>
              <div className="mt-auto flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${(batchProgress.leads.awaiting_triage ?? 0) > 0 ? 'text-blue-400' : 'text-zinc-600'}`}>
                  {batchProgress.leads.awaiting_triage ?? 0}
                </span>
                <span className="text-xs text-zinc-500">zu triagen</span>
              </div>
            </Link>

            {/* Stage 2 — Enrichment-Review */}
            <Link
              href={`/campaigns/${id}/enrichment-review`}
              className={`group flex flex-col gap-2 p-4 rounded-lg border transition-colors ${
                (batchProgress.leads.awaiting_enrichment_review ?? 0) > 0
                  ? 'bg-amber-600/10 border-amber-500/30 hover:bg-amber-600/20'
                  : 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-amber-400" />
                <span className="text-xs text-zinc-400 font-medium">Stage 2</span>
              </div>
              <div>
                <p className="text-sm font-semibold">Enrichment-Review</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">AI-Daten prüfen · Logo/Farben fixen</p>
              </div>
              <div className="mt-auto flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${(batchProgress.leads.awaiting_enrichment_review ?? 0) > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
                  {batchProgress.leads.awaiting_enrichment_review ?? 0}
                </span>
                <span className="text-xs text-zinc-500">zu reviewen</span>
              </div>
            </Link>

            {/* Stage 3 — Final Review */}
            <Link
              href={`/campaigns/${id}/review`}
              className={`group flex flex-col gap-2 p-4 rounded-lg border transition-colors ${
                batchProgress.leads.ready_for_review > 0
                  ? 'bg-green-600/10 border-green-500/30 hover:bg-green-600/20'
                  : 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <ClipboardCheck size={16} className="text-green-400" />
                <span className="text-xs text-zinc-400 font-medium">Stage 3</span>
              </div>
              <div>
                <p className="text-sm font-semibold">Final Review</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Pass + Email · vor Send</p>
              </div>
              <div className="mt-auto flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${batchProgress.leads.ready_for_review > 0 ? 'text-green-400' : 'text-zinc-600'}`}>
                  {batchProgress.leads.ready_for_review}
                </span>
                <span className="text-xs text-zinc-500">zum Freigeben</span>
              </div>
            </Link>
          </div>

          {/* Queue-Hinweis */}
          {((batchProgress.leads.enrichment_queue ?? 0) > 0 || (batchProgress.leads.pass_email_queue ?? 0) > 0) && (
            <div className="mt-4 text-xs text-zinc-500 flex items-center gap-4">
              {(batchProgress.leads.enrichment_queue ?? 0) > 0 && (
                <span>
                  <span className="text-zinc-300">{batchProgress.leads.enrichment_queue}</span> Leads in Enrichment-Queue (Phase A)
                </span>
              )}
              {(batchProgress.leads.pass_email_queue ?? 0) > 0 && (
                <span>
                  <span className="text-zinc-300">{batchProgress.leads.pass_email_queue}</span> in Pass+Email-Queue (Phase B)
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
