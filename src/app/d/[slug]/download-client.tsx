'use client'

import { useState } from 'react'

type Props = {
  leadId: string
  passSerial: string | null
  googlePassUrl: string | null
  isIOS: boolean
  isAndroid: boolean
}

export default function DownloadClient({ leadId, passSerial, googlePassUrl, isIOS, isAndroid }: Props) {
  const [downloading, setDownloading] = useState(false)
  const isMobile = isIOS || isAndroid

  async function trackAndDownloadApple() {
    if (!passSerial || downloading) return
    setDownloading(true)
    try {
      await fetch('/api/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'pass_downloaded', lead_id: leadId, metadata: { platform: 'apple' } }),
      })
    } catch { /* non-fatal */ }
    window.location.assign(`/api/passes/${passSerial}`)
    setTimeout(() => setDownloading(false), 3000)
  }

  async function trackAndDownloadGoogle() {
    if (!googlePassUrl) return
    try {
      await fetch('/api/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'pass_downloaded', lead_id: leadId, metadata: { platform: 'google' } }),
      })
    } catch { /* non-fatal */ }
    window.open(googlePassUrl, '_blank')
  }

  return (
    <div className="w-full space-y-3">

      {/* Bouncing Arrow (like Passify) */}
      <div className="flex justify-center animate-bounce">
        <svg className="w-6 h-6 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>

      {/* Apple Wallet — Official Badge + pulse animation */}
      {(isIOS || !isMobile) && passSerial && (
        <button onClick={trackAndDownloadApple} disabled={downloading}
          className="w-full flex items-center justify-center py-3
            transition-all transform hover:scale-[1.03] active:scale-[0.98]
            disabled:opacity-50 disabled:cursor-not-allowed animate-pulse-subtle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/DE_Add_to_Apple_Wallet_RGB_101421.svg"
            alt="Zu Apple Wallet hinzufügen"
            className="w-full max-w-[280px] h-auto object-contain"
          />
        </button>
      )}

      {/* Google Wallet — Official Badge + pulse animation */}
      {(isAndroid || !isMobile) && googlePassUrl && (
        <button onClick={trackAndDownloadGoogle}
          className="w-full flex items-center justify-center py-3
            transition-all transform hover:scale-[1.03] active:scale-[0.98]
            animate-pulse-subtle" style={{ animationDelay: '1s' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/de_add_to_google_wallet_add-wallet-badge.svg"
            alt="Zu Google Wallet hinzufügen"
            className="w-full max-w-[280px] h-auto object-contain"
          />
        </button>
      )}

      <style>{`
        @keyframes pulse-subtle {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.04); }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
