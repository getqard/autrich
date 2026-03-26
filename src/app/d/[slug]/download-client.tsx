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

      {/* Apple Wallet — primary on iOS, secondary on desktop */}
      {(isIOS || !isMobile) && passSerial && (
        <button onClick={trackAndDownloadApple} disabled={downloading}
          className="group relative flex items-center justify-center gap-3 w-full px-6 py-4
            rounded-2xl font-semibold bg-black text-white border border-white/10
            hover:scale-[1.02] active:scale-[0.98]
            transition-all duration-200 disabled:opacity-70
            shadow-lg shadow-black/50 overflow-hidden">
          {/* Shine sweep animation */}
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out
            bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <svg className="w-6 h-6 relative" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          <span className="relative">
            {downloading ? 'Wird geladen...' : 'Zur Apple Wallet hinzufügen'}
          </span>
        </button>
      )}

      {/* Google Wallet */}
      {(isAndroid || !isMobile) && googlePassUrl && (
        <button onClick={trackAndDownloadGoogle}
          className="group relative flex items-center justify-center gap-3 w-full px-6 py-4
            rounded-2xl font-semibold bg-white text-black border border-gray-200
            hover:bg-gray-50 hover:scale-[1.02] active:scale-[0.98]
            transition-all duration-200 shadow-lg overflow-hidden">
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out
            bg-gradient-to-r from-transparent via-black/5 to-transparent" />
          <svg className="w-5 h-5 relative" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span className="relative">Zu Google Wallet hinzufügen</span>
        </button>
      )}

      {/* WhatsApp */}
      {phone && (
        <a href={`https://wa.me/${phone.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent('Hallo, ich habe gerade eure digitale Treuekarte gesehen!')}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-6 py-3
            rounded-2xl font-medium text-white/60 border border-white/10
            hover:bg-white/5 hover:text-white/80 hover:scale-[1.01] active:scale-[0.99]
            transition-all duration-200 text-sm mt-4">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .612.616l4.575-1.453A11.93 11.93 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.94 9.94 0 0 1-5.39-1.584l-.386-.232-2.716.862.886-2.635-.253-.403A9.935 9.935 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
          </svg>
          Fragen? Per WhatsApp schreiben
        </a>
      )}
    </div>
  )
}
