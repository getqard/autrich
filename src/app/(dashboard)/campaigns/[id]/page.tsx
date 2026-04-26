'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Upload, Loader2, CheckCircle2, XCircle,
  AlertTriangle, FileSpreadsheet, Users, Play, Square,
  Zap, ClipboardCheck, Filter, Layers, Search, Download,
  Send, Pause, RefreshCw, Mail, Eye, MousePointerClick, Reply, Ban,
} from 'lucide-react'

type CampaignDetail = {
  id: string
  name: string
  status: string
  total_leads: number
  processed_leads: number
  created_at: string
  instantly_campaign_id?: string | null
  is_paused?: boolean
  sending_started_at?: string | null
  stats?: {
    total: number
    enrichment: Record<string, number>
    pass: Record<string, number>
    email: Record<string, number>
    pipeline: Record<string, number>
  }
}

type InstantlyStatus = {
  linked: boolean
  instantly_campaign_id?: string | null
  instantly?: { status?: string; [key: string]: unknown } | null
  error?: string
}

type SendStats = {
  queued: number
  sending: number
  sent: number
  opened: number
  clicked: number
  replied: number
  bounced: number
  unsubscribed: number
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
      if (!res.ok && data.reason === 'pending_in_swipe_stages') {
        const blockerText = (data.blockers || []).join('\n• ')
        alert(`Pipeline kann nicht starten:\n\n• ${blockerText}\n\n${data.hint || ''}`)
        await loadBatchProgress()
      } else {
        setBatchProgress(data)
      }
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

  // ─── Instantly Sync + Send State ────────────────────────────────
  const [instantlyStatus, setInstantlyStatus] = useState<InstantlyStatus | null>(null)
  const [sendStats, setSendStats] = useState<SendStats | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false)
  const [sendDryRun, setSendDryRun] = useState<{ would_send: number; first_3?: Array<{ email: string; business_name: string; subject: string }> } | null>(null)
  const [sendResult, setSendResult] = useState<{ uploaded: number; duplicates: number; errors: string[] } | null>(null)

  const loadInstantlyStatus = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}/instantly-sync`)
    if (res.ok) setInstantlyStatus(await res.json())
  }, [id])

  const loadSendStats = useCallback(async () => {
    const res = await fetch(`/api/leads?campaign_id=${id}&limit=1`)
    if (!res.ok) return
    // Wir brauchen Counts pro email_status. Quick-Approach: pro Status einen
    // separaten Count via Stats-Endpoint. Hier nutzen wir batchProgress.leads
    // wenn da, sonst leer.
    // Für genaue Counts: separater Endpoint /api/campaigns/[id]/email-stats wäre besser
    // Kommt in Phase X2. Jetzt: aus campaign.stats.email
  }, [id])

  useEffect(() => {
    if (campaign && campaign.total_leads > 0) {
      loadInstantlyStatus()
      loadSendStats()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id])

  // Aus campaign.stats.email die SendStats ableiten
  useEffect(() => {
    if (!campaign?.stats?.email) return
    const e = campaign.stats.email
    setSendStats({
      queued: e.queued || 0,
      sending: e.sending || 0,
      sent: e.sent || 0,
      opened: e.opened || 0,
      clicked: e.clicked || 0,
      replied: e.replied || 0,
      bounced: e.bounced || 0,
      unsubscribed: e.unsubscribed || 0,
    })
  }, [campaign?.stats?.email])

  async function syncToInstantly() {
    setSyncLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/instantly-sync`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(`Sync fehlgeschlagen: ${data.error}${data.missing ? '\nFehlt: ' + data.missing.join(', ') : ''}`)
      } else {
        await loadInstantlyStatus()
        await loadCampaign()
      }
    } finally { setSyncLoading(false) }
  }

  async function previewSend() {
    setSendLoading(true)
    setSendDryRun(null)
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Vorschau fehlgeschlagen: ${data.error}`)
      } else {
        setSendDryRun(data)
        setSendConfirmOpen(true)
      }
    } finally { setSendLoading(false) }
  }

  async function confirmSend() {
    setSendLoading(true)
    setSendResult(null)
    setSendConfirmOpen(false)
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(`Versand fehlgeschlagen: ${data.error}`)
      } else {
        setSendResult({ uploaded: data.uploaded || 0, duplicates: data.duplicates || 0, errors: data.errors || [] })
        await loadCampaign()
      }
    } finally { setSendLoading(false) }
  }

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

      <div className="flex items-center justify-between mb-6">
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

      {/* Next-Step-Banner — der wichtigste UI-Element auf dieser Seite. */}
      <NextStepBanner
        campaign={campaign}
        batchProgress={batchProgress}
        sendStats={sendStats}
        instantlyLinked={!!instantlyStatus?.linked}
      />

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
          <div className="flex items-center gap-3 flex-wrap">
            {(() => {
              const queueEmpty = batchProgress?.leads
                ? (batchProgress.leads.enrichment_queue ?? 0) === 0 &&
                  (batchProgress.leads.pass_email_queue ?? 0) === 0
                : false
              const triageOpen = (batchProgress?.leads?.awaiting_triage ?? 0) > 0
              const erOpen = (batchProgress?.leads?.awaiting_enrichment_review ?? 0) > 0
              const isIdle = !batchProgress || batchProgress.status === 'idle' || batchProgress.status === 'completed'

              if (!isIdle) {
                return (
                  <>
                    {batchProgress?.status === 'running' && (
                      <>
                        <button
                          onClick={stopBatch}
                          className="flex items-center gap-2 px-5 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium"
                        >
                          <Square size={16} /> Stoppen
                        </button>
                        <div className="flex items-center gap-2 text-sm text-zinc-500">
                          <Loader2 size={14} className="animate-spin" /> Wird verarbeitet...
                        </div>
                      </>
                    )}
                  </>
                )
              }

              return (
                <>
                  <button
                    onClick={startBatch}
                    disabled={batchLoading || queueEmpty}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed"
                    title={queueEmpty ? 'Keine Leads in der Pipeline-Queue — erst Triage / Enrichment-Review machen' : ''}
                  >
                    {batchLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    {batchProgress?.status === 'completed' ? 'Nochmal starten' : 'Pipeline starten'}
                  </button>

                  {queueEmpty && (triageOpen || erOpen) && (
                    <div className="text-xs text-amber-400 max-w-md">
                      Pipeline-Queue ist leer. Approve erst Leads in
                      {triageOpen && (
                        <>{' '}
                          <Link href={`/campaigns/${id}/triage`} className="underline hover:text-white">
                            Stage 1 ({batchProgress?.leads?.awaiting_triage ?? 0})
                          </Link>
                        </>
                      )}
                      {triageOpen && erOpen && ' bzw. '}
                      {erOpen && (
                        <Link href={`/campaigns/${id}/enrichment-review`} className="underline hover:text-white">
                          Stage 2 ({batchProgress?.leads?.awaiting_enrichment_review ?? 0})
                        </Link>
                      )}
                      .
                    </div>
                  )}

                  {queueEmpty && !triageOpen && !erOpen && batchProgress?.status === 'completed' && (
                    <div className="text-xs text-zinc-500">
                      Alle Leads durchgearbeitet.
                    </div>
                  )}
                </>
              )
            })()}
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

      {/* ═══ Versand via Instantly (Block 6) ═══ */}
      {campaign.total_leads > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Send size={18} /> Versand via Instantly
            </h3>
            <button
              onClick={loadInstantlyStatus}
              className="text-xs text-zinc-500 hover:text-white inline-flex items-center gap-1.5"
            >
              <RefreshCw size={11} /> Status aktualisieren
            </button>
          </div>

          {!instantlyStatus?.linked ? (
            <div className="text-sm">
              <p className="text-zinc-400 mb-4">
                Diese Kampagne ist noch nicht mit Instantly verbunden. Verbindung legt eine
                Instantly-Campaign mit 3-Step-Sequence an (Initial + 3T + 7T).
              </p>
              <button
                onClick={syncToInstantly}
                disabled={syncLoading}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {syncLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Mit Instantly verbinden
              </button>
            </div>
          ) : (
            <>
              <div className="text-xs text-zinc-500 mb-4 flex items-center gap-2">
                <CheckCircle2 size={12} className="text-green-400" />
                Verbunden: <code className="text-zinc-300">{instantlyStatus.instantly_campaign_id}</code>
                {instantlyStatus.instantly?.status && (
                  <span className="text-zinc-500"> · Status: {String(instantlyStatus.instantly.status)}</span>
                )}
              </div>

              {/* Send-Stats Grid */}
              {sendStats && (
                <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-5">
                  <SendTile icon={Mail} label="Bereit" value={sendStats.queued} color="amber" />
                  <SendTile icon={Send} label="Versendet" value={sendStats.sending + sendStats.sent} color="blue" />
                  <SendTile icon={Eye} label="Geöffnet" value={sendStats.opened} color="purple" />
                  <SendTile icon={MousePointerClick} label="Geklickt" value={sendStats.clicked} color="purple" />
                  <SendTile icon={Reply} label="Antwort" value={sendStats.replied} color="green" />
                  <SendTile icon={XCircle} label="Bounce" value={sendStats.bounced} color="red" />
                  <SendTile icon={Ban} label="Abmelden" value={sendStats.unsubscribed} color="red" />
                  <SendTile icon={CheckCircle2} label="Total" value={Object.values(sendStats).reduce((a, b) => a + b, 0)} color="zinc" />
                </div>
              )}

              {/* Send Action */}
              {sendStats && sendStats.queued > 0 ? (
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={previewSend}
                    disabled={sendLoading}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {sendLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {sendStats.queued} Lead{sendStats.queued > 1 ? 's' : ''} versenden
                  </button>
                  <span className="text-xs text-zinc-500">
                    Nach „Senden" geht jeder Lead durch die 3-Step-Sequence (+0/+3/+7 Tage).
                  </span>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  Keine versandbereiten Leads (email_status=queued). Gib zuerst Leads in Stage 3 (Final Review) frei.
                </p>
              )}

              {/* Send Result */}
              {sendResult && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mt-3 text-xs">
                  <p className="text-green-400 flex items-center gap-2">
                    <CheckCircle2 size={12} /> {sendResult.uploaded} Lead(s) zu Instantly hochgeladen
                    {sendResult.duplicates > 0 && `, ${sendResult.duplicates} Duplikat(e) übersprungen`}
                  </p>
                  {sendResult.errors.length > 0 && (
                    <p className="text-red-400 mt-1">{sendResult.errors.length} Fehler: {sendResult.errors[0]}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Send-Confirmation Modal */}
      {sendConfirmOpen && sendDryRun && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-3">Versand bestätigen</h3>
            <p className="text-sm text-zinc-400 mb-4">
              <strong className="text-white">{sendDryRun.would_send} Leads</strong> werden zu Instantly hochgeladen.
              Sequence: Initial + Follow-up nach 3 Tagen + Follow-up nach 7 Tagen.
            </p>
            {sendDryRun.first_3 && sendDryRun.first_3.length > 0 && (
              <div className="bg-zinc-800 rounded-lg p-3 mb-4 text-xs space-y-1.5">
                <p className="text-zinc-500 mb-1">Stichprobe (erste 3):</p>
                {sendDryRun.first_3.map((l, i) => (
                  <div key={i} className="text-zinc-300">
                    <span className="text-zinc-500">{l.email}</span>
                    <span className="text-zinc-600"> · </span>
                    <span className="italic">{l.subject}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={confirmSend}
                disabled={sendLoading}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {sendLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Ja, jetzt senden
              </button>
              <button
                onClick={() => setSendConfirmOpen(false)}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Next-Step-Banner ────────────────────────────────────────────

function NextStepBanner({
  campaign,
  batchProgress,
  sendStats,
  instantlyLinked,
}: {
  campaign: CampaignDetail
  batchProgress: BatchProgressShape | null
  sendStats: SendStats | null
  instantlyLinked: boolean
}) {
  const step = computeNextStep(campaign, batchProgress, sendStats, instantlyLinked)
  if (!step) return null

  const tones: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-200',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
    green: 'bg-green-500/10 border-green-500/30 text-green-200',
    zinc: 'bg-zinc-800/50 border-zinc-700 text-zinc-300',
  }

  return (
    <div className={`mb-6 px-5 py-4 rounded-xl border flex items-center justify-between gap-4 ${tones[step.tone]}`}>
      <div>
        <p className="text-xs uppercase tracking-wider text-current/70 mb-0.5">Nächster Schritt</p>
        <p className="font-semibold text-base text-white">{step.title}</p>
        <p className="text-sm text-current/80 mt-0.5">{step.description}</p>
      </div>
      {step.cta && (
        <Link
          href={step.cta.href}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200"
        >
          {step.cta.label} →
        </Link>
      )}
    </div>
  )
}

type BatchProgressShape = {
  status: string
  leads?: {
    total: number
    pending: number
    ready_for_review: number
    awaiting_triage?: number
    enrichment_queue?: number
    awaiting_enrichment_review?: number
    pass_email_queue?: number
  }
}

type NextStep = {
  title: string
  description: string
  tone: 'blue' | 'amber' | 'green' | 'zinc'
  cta?: { href: string; label: string }
}

function computeNextStep(
  campaign: CampaignDetail,
  batch: BatchProgressShape | null,
  send: SendStats | null,
  instantlyLinked: boolean,
): NextStep | null {
  const leads = batch?.leads
  const totalLeads = campaign.total_leads

  if (totalLeads === 0) {
    return {
      title: 'Beschaffe Leads für diese Kampagne',
      description: 'Scrape Google Maps direkt für eine Branche+Stadt — oder lade eine bestehende CSV/Excel hoch.',
      tone: 'blue',
      cta: { href: `/scraping?campaign_id=${campaign.id}`, label: 'Scraping starten' },
    }
  }

  if ((leads?.awaiting_triage ?? 0) > 0) {
    return {
      title: `Stage 1 — Triage offen (${leads!.awaiting_triage} Leads)`,
      description: 'Geh die Leads durch und entscheide rein/raus. Nur approved Leads kommen in die Pipeline und kosten AI-Tokens.',
      tone: 'blue',
      cta: { href: `/campaigns/${campaign.id}/triage`, label: 'Triage öffnen' },
    }
  }

  if (batch?.status === 'running') {
    return {
      title: 'Pipeline läuft gerade',
      description: 'Die Batch-Pipeline verarbeitet Leads in 10er-Chunks. Du kannst zurückkommen wenn sie fertig ist.',
      tone: 'amber',
    }
  }

  if ((leads?.enrichment_queue ?? 0) > 0) {
    return {
      title: `Pipeline starten — ${leads!.enrichment_queue} Leads in Enrichment-Queue`,
      description: 'Approved Leads warten auf Phase A: Logo, Farben, Klassifikation. Klick "Pipeline starten" unten.',
      tone: 'amber',
    }
  }

  if ((leads?.awaiting_enrichment_review ?? 0) > 0) {
    return {
      title: `Stage 2 — Enrichment-Review (${leads!.awaiting_enrichment_review} Leads)`,
      description: 'Logo, Farben, Geschenk, Branche prüfen und ggf. inline editieren. Approved Leads bekommen Pass + Email.',
      tone: 'amber',
      cta: { href: `/campaigns/${campaign.id}/enrichment-review`, label: 'Stage 2 öffnen' },
    }
  }

  if ((leads?.pass_email_queue ?? 0) > 0) {
    return {
      title: `Pipeline weiter starten — ${leads!.pass_email_queue} Leads in Pass+Email-Queue`,
      description: 'Phase B: Pass-Generation, Email-Generation, Mockup. Klick "Pipeline starten" unten.',
      tone: 'amber',
    }
  }

  if ((leads?.ready_for_review ?? 0) > 0) {
    return {
      title: `Stage 3 — Final Review (${leads!.ready_for_review} Leads)`,
      description: 'Pass + Email + Mockup ansehen, ggf. Strategie wechseln. Approved Leads gehen auf Versand-bereit.',
      tone: 'green',
      cta: { href: `/campaigns/${campaign.id}/review`, label: 'Stage 3 öffnen' },
    }
  }

  if (send && send.queued > 0 && !instantlyLinked) {
    return {
      title: `${send.queued} Leads versandbereit — Instantly verbinden`,
      description: 'Verknüpfe die Kampagne mit Instantly, dann kannst du senden. 3-Step-Sequence (Initial + 3T + 7T) wird automatisch angelegt.',
      tone: 'green',
    }
  }

  if (send && send.queued > 0 && instantlyLinked) {
    return {
      title: `${send.queued} Leads versandbereit — jetzt senden`,
      description: 'Klick "Versenden" in der Versand-Sektion unten. Pre-Confirm zeigt dir die ersten 3 Subjects.',
      tone: 'green',
    }
  }

  if (send && (send.sent > 0 || send.sending > 0)) {
    return {
      title: 'Kampagne aktiv — Replies kommen rein',
      description: `${send.sent + send.sending} versendet, ${send.opened} geöffnet, ${send.replied} geantwortet. Antworten siehst du in der Inbox.`,
      tone: 'zinc',
      cta: send.replied > 0 ? { href: `/inbox?campaign_id=${campaign.id}`, label: `${send.replied} Replies ansehen` } : undefined,
    }
  }

  return {
    title: 'Alle Leads bearbeitet',
    description: 'Diese Kampagne hat keine offenen Stages. Erstelle eine neue oder befülle diese mit weiteren Leads.',
    tone: 'zinc',
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function SendTile({ icon: Icon, label, value, color }: {
  icon: typeof Mail
  label: string
  value: number
  color: 'amber' | 'blue' | 'purple' | 'green' | 'red' | 'zinc'
}) {
  const colors: Record<string, string> = {
    amber: 'text-amber-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    green: 'text-green-400',
    red: 'text-red-400',
    zinc: 'text-zinc-300',
  }
  return (
    <div className="bg-zinc-800/50 rounded-lg p-2.5 text-center">
      <Icon size={12} className={`mx-auto ${colors[color]}`} />
      <div className={`text-lg font-bold mt-1 ${colors[color]}`}>{value.toLocaleString('de-DE')}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  )
}
