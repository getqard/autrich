'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Upload, Loader2, CheckCircle2, XCircle,
  AlertTriangle, FileSpreadsheet, Users
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
        {campaign.total_leads > 0 && (
          <Link
            href={`/leads?campaign_id=${campaign.id}`}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700 transition-colors"
          >
            <Users size={16} /> Leads ansehen
          </Link>
        )}
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
    </div>
  )
}
