'use client'

import { useState } from 'react'

type Props = {
  leadId: string
  passSerial: string | null
  googlePassUrl: string | null
  phone: string | null
  isIOS: boolean
  isAndroid: boolean
}

export default function DownloadClient({ leadId, passSerial, googlePassUrl, phone, isIOS, isAndroid }: Props) {
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

      {/* WhatsApp */}
      {phone && (
        <a href={`https://wa.me/${phone.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent('Hallo, ich habe gerade eure digitale Treuekarte gesehen!')}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-6 py-3
            rounded-2xl font-medium text-white/50 border border-white/10
            hover:bg-white/5 hover:text-white/70 hover:scale-[1.01] active:scale-[0.99]
            transition-all duration-200 text-sm mt-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .612.616l4.575-1.453A11.93 11.93 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.94 9.94 0 0 1-5.39-1.584l-.386-.232-2.716.862.886-2.635-.253-.403A9.935 9.935 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
          </svg>
          Fragen? Per WhatsApp
        </a>
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
