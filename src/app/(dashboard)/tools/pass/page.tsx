'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Wallet, ArrowLeft, Loader2, CheckCircle, XCircle, Download, ExternalLink } from 'lucide-react'

export default function PassPage() {
  // Form state
  const [businessName, setBusinessName] = useState('Döner Palace')
  const [passTitle, setPassTitle] = useState('Treuekarte')
  const [bgColor, setBgColor] = useState('#1a1a2e')
  const [textColor, setTextColor] = useState('#ffffff')
  const [labelColor, setLabelColor] = useState('#d4a574')
  const [stampEmoji, setStampEmoji] = useState('🥙')
  const [currentStamps, setCurrentStamps] = useState(3)
  const [maxStamps, setMaxStamps] = useState(10)
  const [reward, setReward] = useState('1 Gratis Döner')
  const [rewardEmoji, setRewardEmoji] = useState('🎉')
  const [logoUrl, setLogoUrl] = useState('')
  const [stripUrl, setStripUrl] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [openingHours, setOpeningHours] = useState('')

  // Status
  const [loading, setLoading] = useState(false)
  const [appleValid, setAppleValid] = useState<boolean | null>(null)
  const [googleValid, setGoogleValid] = useState<boolean | null>(null)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  async function handleValidate() {
    setValidating(true)
    setError(null)

    try {
      const [appleRes, googleRes] = await Promise.all([
        fetch('/api/tools/pass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'validate-apple' }),
        }),
        fetch('/api/tools/pass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'validate-google' }),
        }),
      ])

      const apple = await appleRes.json()
      const google = await googleRes.json()

      setAppleValid(apple.valid)
      setGoogleValid(google.valid)

      if (!apple.valid || !google.valid) {
        setError([
          !apple.valid ? `Apple: ${apple.error}` : null,
          !google.valid ? `Google: ${google.error}` : null,
        ].filter(Boolean).join('\n'))
      }
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setValidating(false)
    }
  }

  async function handleGenerate() {
    if (!businessName) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/tools/pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          business_name: businessName,
          pass_title: passTitle,
          background_color: bgColor,
          text_color: textColor,
          label_color: labelColor,
          stamp_emoji: stampEmoji,
          current_stamps: currentStamps,
          max_stamps: maxStamps,
          reward,
          reward_emoji: rewardEmoji,
          logo_url: logoUrl || undefined,
          strip_image_url: stripUrl || undefined,
          address: address || undefined,
          phone: phone || undefined,
          website: website || undefined,
          opening_hours: openingHours || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setResult(data)
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setLoading(false)
    }
  }

  const appleResult = result?.apple as Record<string, string | number> | undefined
  const googleResult = result?.google as Record<string, string | number> | undefined

  return (
    <div>
      <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6">
        <ArrowLeft size={14} /> Zurück zu Tools
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-zinc-800 rounded-lg">
          <Wallet size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">Pass Generator</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        Formular ausfüllen &rarr; Apple .pkpass + Google Wallet Pass generieren und downloaden
      </p>

      {/* Validation */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-4">
          <button onClick={handleValidate} disabled={validating}
            className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 flex items-center gap-2">
            {validating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Zertifikate prüfen
          </button>
          {appleValid !== null && (
            <span className={`flex items-center gap-1.5 text-sm ${appleValid ? 'text-green-400' : 'text-red-400'}`}>
              {appleValid ? <CheckCircle size={14} /> : <XCircle size={14} />}
              Apple {appleValid ? 'OK' : 'Fehler'}
            </span>
          )}
          {googleValid !== null && (
            <span className={`flex items-center gap-1.5 text-sm ${googleValid ? 'text-green-400' : 'text-red-400'}`}>
              {googleValid ? <CheckCircle size={14} /> : <XCircle size={14} />}
              Google {googleValid ? 'OK' : 'Fehler'}
            </span>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Business-Daten</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Input label="Business Name" value={businessName} onChange={setBusinessName} placeholder="Döner Palace" />
          <Input label="Pass-Titel" value={passTitle} onChange={setPassTitle} placeholder="Treuekarte" />
          <Input label="Logo URL" value={logoUrl} onChange={setLogoUrl} placeholder="https://..." />
          <Input label="Strip Image URL" value={stripUrl} onChange={setStripUrl} placeholder="https://... (optional)" />
          <Input label="Adresse" value={address} onChange={setAddress} placeholder="Kottbusser Damm 12, Berlin" />
          <Input label="Telefon" value={phone} onChange={setPhone} placeholder="030-12345678" />
          <Input label="Website" value={website} onChange={setWebsite} placeholder="doener-palace.de" />
          <Input label="Öffnungszeiten" value={openingHours} onChange={setOpeningHours} placeholder="Mo-Sa 10-23" />
        </div>

        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Design</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <ColorInput label="Hintergrund" value={bgColor} onChange={setBgColor} />
          <ColorInput label="Text" value={textColor} onChange={setTextColor} />
          <ColorInput label="Label" value={labelColor} onChange={setLabelColor} />
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Vorschau</label>
            <div className="rounded-lg p-3 text-center text-xs" style={{ backgroundColor: bgColor, color: textColor }}>
              <span style={{ color: labelColor }}>PRÄMIE</span>
              <br />{reward}
            </div>
          </div>
        </div>

        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Stempel & Prämie</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Input label="Stamp Emoji" value={stampEmoji} onChange={setStampEmoji} placeholder="🥙" />
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Aktuelle Stempel</label>
            <input type="number" min={0} max={maxStamps} value={currentStamps}
              onChange={e => setCurrentStamps(parseInt(e.target.value) || 0)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/20" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Max Stempel</label>
            <input type="number" min={1} max={20} value={maxStamps}
              onChange={e => setMaxStamps(parseInt(e.target.value) || 10)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/20" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Stempel-Vorschau</label>
            <div className="bg-zinc-800 rounded-lg px-3 py-2 text-sm tracking-wider">
              {stampEmoji.repeat(currentStamps)}{'⚪'.repeat(maxStamps - currentStamps)}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Input label="Prämie" value={reward} onChange={setReward} placeholder="1 Gratis Döner" />
          <Input label="Prämie Emoji" value={rewardEmoji} onChange={setRewardEmoji} placeholder="🎉" />
        </div>

        {/* Generate Button */}
        <button onClick={handleGenerate} disabled={loading || !businessName}
          className="px-6 py-3 bg-white text-black rounded-lg text-sm font-semibold hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
          Apple + Google Pass generieren
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-400 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-300">Ergebnis ({result.durationMs as number}ms)</h3>

          {/* Apple */}
          {appleResult && !appleResult.error && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-400 font-medium">Apple .pkpass</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Serial: {appleResult.serial as string} | {((appleResult.sizeBytes as number) / 1024).toFixed(0)} KB
                  </p>
                </div>
                <a href={appleResult.downloadUrl as string}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500">
                  <Download size={14} /> Download .pkpass
                </a>
              </div>
            </div>
          )}
          {appleResult?.error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-400">Apple Fehler: {appleResult.error as string}</p>
            </div>
          )}

          {/* Google */}
          {googleResult && !googleResult.error && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-400 font-medium">Google Wallet</p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-md truncate">
                    {(googleResult.saveUrl as string).substring(0, 80)}...
                  </p>
                </div>
                <a href={googleResult.saveUrl as string} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">
                  <ExternalLink size={14} /> Google Wallet öffnen
                </a>
              </div>
            </div>
          )}
          {googleResult?.error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-400">Google Fehler: {googleResult.error as string}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Reusable Components ────────────────────────────────────────

function Input({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20" />
    </div>
  )
}

function ColorInput({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-zinc-600 cursor-pointer bg-transparent" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-white/20" />
      </div>
    </div>
  )
}
