'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, X, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'

type HealthData = {
  status: 'ready' | 'setup_needed'
  checks: Record<string, string>
  timestamp: string
}

const CHECK_LABELS: Record<string, { label: string; group: 'core' | 'wallet' | 'send' | 'legal' }> = {
  supabase: { label: 'Supabase (Datenbank)', group: 'core' },
  anthropic: { label: 'Anthropic Claude (Email-Generation)', group: 'core' },
  gemini: { label: 'Google Gemini (Klassifikation, Logo-Vision)', group: 'core' },
  gmaps_scraper: { label: 'Google Maps Scraper (Botasaurus)', group: 'core' },
  screenshot: { label: 'ScreenshotOne (Website-Screenshots)', group: 'core' },
  apple_wallet: { label: 'Apple Wallet (Pass-Generation)', group: 'wallet' },
  google_wallet: { label: 'Google Wallet (JWT-Pässe)', group: 'wallet' },
  instantly: { label: 'Instantly.ai API-Key', group: 'send' },
  instantly_webhook_secret: { label: 'Instantly Webhook-Secret', group: 'send' },
  company_legal: { label: 'Erfolgssinn LLC (Impressum + Footer)', group: 'legal' },
  download_base_url: { label: 'NEXT_PUBLIC_DOWNLOAD_BASE_URL', group: 'legal' },
}

const GROUP_LABELS: Record<string, string> = {
  core: 'Core-Services',
  wallet: 'Wallet-Pässe',
  send: 'Email-Versand (Instantly)',
  legal: 'Recht / Impressum',
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      if (res.ok) setHealth(await res.json())
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const grouped: Record<string, Array<[string, string]>> = { core: [], wallet: [], send: [], legal: [] }
  if (health) {
    for (const [key, status] of Object.entries(health.checks)) {
      const meta = CHECK_LABELS[key]
      if (meta) grouped[meta.group].push([key, status])
    }
  }

  const missingCount = health
    ? Object.values(health.checks).filter((v) => v !== 'configured').length
    : 0

  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <h2 className="text-2xl font-bold">Settings</h2>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-zinc-500 hover:text-white inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Status neu laden
        </button>
      </div>
      <p className="text-zinc-400 mb-6">
        Konfiguration läuft über <code className="text-zinc-300">.env.local</code> (lokal) und <code className="text-zinc-300">Vercel → Settings → Environment Variables</code> (Production).
        Hier nur Lesezugriff — keine Speicherung in der DB.
      </p>

      {health && health.status === 'setup_needed' && missingCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex gap-3">
          <AlertCircle className="text-amber-400 shrink-0 mt-0.5" size={18} />
          <div className="text-sm">
            <div className="font-medium text-amber-200">{missingCount} ENV-Variable{missingCount > 1 ? 'n' : ''} fehl{missingCount > 1 ? 'en' : 't'}.</div>
            <div className="text-amber-400/80 mt-1">
              Bis alle Bereiche grün sind kannst du keine echten Cold-Emails über Instantly versenden.
              Setze die Werte in <code>.env.local</code> + Vercel Environment Variables, dann Server neu starten.
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {(['core', 'wallet', 'send', 'legal'] as const).map((group) => (
          <div key={group} className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            <h3 className="text-lg font-semibold mb-4">{GROUP_LABELS[group]}</h3>
            {loading && !health ? (
              <div className="text-sm text-zinc-500">Prüfe Status…</div>
            ) : (
              <div className="space-y-2">
                {grouped[group].map(([key, status]) => (
                  <CheckRow key={key} keyName={key} status={status} />
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Quicklinks</h3>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <Link href="/impressum" target="_blank" className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg">
              <span>Impressum-Seite ansehen</span>
              <ExternalLink size={12} className="text-zinc-500" />
            </Link>
            <Link href="/datenschutz" target="_blank" className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg">
              <span>Datenschutz-Seite ansehen</span>
              <ExternalLink size={12} className="text-zinc-500" />
            </Link>
            <Link href="/api/health" target="_blank" className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg">
              <span>Health-Check (raw JSON)</span>
              <ExternalLink size={12} className="text-zinc-500" />
            </Link>
            <Link href="/tools" className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg">
              <span>Dev-Tools (versteckt)</span>
              <ExternalLink size={12} className="text-zinc-500" />
            </Link>
          </div>
        </div>
      </div>

      {health && (
        <p className="text-[11px] text-zinc-700 mt-6 text-right">
          Stand: {new Date(health.timestamp).toLocaleString('de-DE')}
        </p>
      )}
    </div>
  )
}

function CheckRow({ keyName, status }: { keyName: string; status: string }) {
  const meta = CHECK_LABELS[keyName]
  const ok = status === 'configured'
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
      <div>
        <div className="text-sm">{meta?.label || keyName}</div>
        <code className="text-[10px] text-zinc-600">{keyName}</code>
      </div>
      <span className={`text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 ${
        ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
      }`}>
        {ok ? <Check size={11} /> : <X size={11} />}
        {ok ? 'konfiguriert' : 'fehlt'}
      </span>
    </div>
  )
}
