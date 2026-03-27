'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowLeft, Loader2, Copy, CheckCircle, RefreshCw } from 'lucide-react'

type EmailResult = {
  subject: string
  body: string
  strategy: string
  word_count: number
  cost_usd: number
  durationMs: number
}

const STRATEGIES = [
  { id: 'curiosity', label: 'Curiosity', desc: 'Neugierig machen' },
  { id: 'social_proof', label: 'Social Proof', desc: 'Zahlen betonen' },
  { id: 'direct', label: 'Direct', desc: 'Auf den Punkt' },
  { id: 'storytelling', label: 'Story', desc: 'Mini-Geschichte' },
  { id: 'provocation', label: 'Provocation', desc: 'Zum Nachdenken' },
]

export default function EmailPage() {
  const [businessName, setBusinessName] = useState('Döner Palace')
  const [contactName, setContactName] = useState('')
  const [contactFirst, setContactFirst] = useState('')
  const [contactLast, setContactLast] = useState('')
  const [city, setCity] = useState('Berlin')
  const [industry, setIndustry] = useState('doener')
  const [description, setDescription] = useState('')
  const [websiteAbout, setWebsiteAbout] = useState('')
  const [headlines, setHeadlines] = useState('')
  const [foundingYear, setFoundingYear] = useState('')
  const [rating, setRating] = useState('4.8')
  const [reviews, setReviews] = useState('127')
  const [hook1, setHook1] = useState('')
  const [hook2, setHook2] = useState('')
  const [hook3, setHook3] = useState('')
  const [notes, setNotes] = useState('')
  const [reward, setReward] = useState('1 Gratis Döner')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [strategy, setStrategy] = useState('curiosity')
  const [formal, setFormal] = useState(false)

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EmailResult | null>(null)
  const [allResults, setAllResults] = useState<EmailResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleGenerate(strat?: string) {
    setLoading(true)
    setError(null)
    setResult(null)
    setAllResults(null)

    try {
      const body = {
        action: 'generate',
        business_name: businessName,
        contact_name: contactName || null,
        contact_first_name: contactFirst || (contactName ? contactName.split(' ')[0] : null),
        contact_last_name: contactLast || (contactName ? contactName.split(' ').slice(-1)[0] : null),
        city: city || null,
        industry: industry || null,
        website_description: description || null,
        website_about: websiteAbout || null,
        website_headlines: headlines || null,
        founding_year: foundingYear || null,
        google_rating: rating || null,
        google_reviews_count: reviews || null,
        email_hooks: [hook1, hook2, hook3].filter(Boolean),
        personalization_notes: notes || null,
        detected_reward: reward || null,
        download_url: downloadUrl || `https://autrich.vercel.app/d/demo`,
        strategy: strat || strategy,
        formal,
      }

      const res = await fetch('/api/tools/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  async function handleGenerateAll() {
    setLoading(true)
    setError(null)
    setResult(null)
    setAllResults(null)

    try {
      const body = {
        action: 'generate-all',
        business_name: businessName,
        contact_name: contactName || null,
        contact_first_name: contactFirst || (contactName ? contactName.split(' ')[0] : null),
        contact_last_name: contactLast || (contactName ? contactName.split(' ').slice(-1)[0] : null),
        city: city || null,
        industry: industry || null,
        website_description: description || null,
        website_about: websiteAbout || null,
        website_headlines: headlines || null,
        founding_year: foundingYear || null,
        google_rating: rating || null,
        google_reviews_count: reviews || null,
        email_hooks: [hook1, hook2, hook3].filter(Boolean),
        personalization_notes: notes || null,
        detected_reward: reward || null,
        download_url: downloadUrl || `https://autrich.vercel.app/d/demo`,
        formal,
      }

      const res = await fetch('/api/tools/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setAllResults(data.results)
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setLoading(false)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6">
        <ArrowLeft size={14} /> Zurück zu Tools
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-zinc-800 rounded-lg"><Mail size={22} className="text-zinc-400" /></div>
        <h2 className="text-2xl font-bold">Email Writer</h2>
      </div>
      <p className="text-zinc-400 mb-8">Lead-Daten + Strategie &rarr; hyperpersonalisierte Cold Email</p>

      {/* Form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6 space-y-5">
        <h3 className="text-sm font-semibold text-zinc-300">Business-Daten</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input label="Business Name" value={businessName} onChange={setBusinessName} />
          <Input label="Kontakt (voll)" value={contactName} onChange={setContactName} placeholder="Ahmed Müller" />
          <Input label="Stadt" value={city} onChange={setCity} />
          <Input label="Branche" value={industry} onChange={setIndustry} placeholder="doener" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input label="Vorname" value={contactFirst} onChange={setContactFirst} placeholder="auto aus Kontakt" />
          <Input label="Nachname" value={contactLast} onChange={setContactLast} placeholder="auto aus Kontakt" />
          <Input label="Rating" value={rating} onChange={setRating} placeholder="4.8" />
          <Input label="Bewertungen" value={reviews} onChange={setReviews} placeholder="127" />
        </div>

        <h3 className="text-sm font-semibold text-zinc-300">Enrichment</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Website-Beschreibung" value={description} onChange={setDescription} placeholder="Meta description..." />
          <Input label="Über uns (Text)" value={websiteAbout} onChange={setWebsiteAbout} placeholder="Familienrezept seit 2005..." />
          <Input label="Headlines" value={headlines} onChange={setHeadlines} placeholder="Beste Pizza | Frisch gebacken..." />
          <Input label="Gründungsjahr" value={foundingYear} onChange={setFoundingYear} placeholder="2010" />
        </div>

        <h3 className="text-sm font-semibold text-zinc-300">Email Hooks (vom AI Classifier)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input label="Hook 1" value={hook1} onChange={setHook1} placeholder="Seit 2010 im Geschäft..." />
          <Input label="Hook 2" value={hook2} onChange={setHook2} placeholder="2.3k Follower..." />
          <Input label="Hook 3" value={hook3} onChange={setHook3} placeholder="Kreuzberg hat 40+ Dönerläden..." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Personalization Notes" value={notes} onChange={setNotes} placeholder="Betont Tradition + Community" />
          <Input label="Prämie" value={reward} onChange={setReward} placeholder="1 Gratis Döner" />
        </div>
        <Input label="Download-Link" value={downloadUrl} onChange={setDownloadUrl} placeholder="https://autrich.vercel.app/d/doener-palace" />

        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-400 flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formal} onChange={e => setFormal(e.target.checked)} className="rounded" />
            Siezen (Sie statt Du)
          </label>
        </div>

        {/* Strategy Selection */}
        <h3 className="text-sm font-semibold text-zinc-300">Strategie</h3>
        <div className="flex flex-wrap gap-2">
          {STRATEGIES.map(s => (
            <button key={s.id} onClick={() => setStrategy(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                strategy === s.id ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}>
              {s.label} <span className="text-[10px] opacity-60 ml-1">{s.desc}</span>
            </button>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button onClick={() => handleGenerate()} disabled={loading || !businessName}
            className="px-5 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 flex items-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            Email generieren
          </button>
          <button onClick={handleGenerateAll} disabled={loading || !businessName}
            className="px-5 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 flex items-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Alle 5 Strategien
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Single Result */}
      {result && <EmailPreview email={result} onCopy={copyToClipboard} copied={copied} />}

      {/* All 5 Results */}
      {allResults && (
        <div className="space-y-4">
          {allResults.map((r, i) => (
            <EmailPreview key={i} email={r} onCopy={copyToClipboard} copied={copied} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmailPreview({ email, onCopy, copied }: { email: EmailResult; onCopy: (t: string) => void; copied: boolean }) {
  const stratLabel = STRATEGIES.find(s => s.id === email.strategy)?.label || email.strategy
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">{stratLabel}</span>
          <span className="text-[10px] text-zinc-600">{email.word_count} Wörter | ${email.cost_usd?.toFixed(5)} | {email.durationMs}ms</span>
        </div>
        <button onClick={() => onCopy(`Subject: ${email.subject}\n\n${email.body}`)}
          className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 rounded text-xs text-zinc-400 hover:text-white transition-colors">
          {copied ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} />}
          {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
      <p className="text-sm font-semibold text-zinc-200 mb-3">Subject: {email.subject}</p>
      <div className="bg-zinc-800/50 rounded-lg p-4 text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
        {email.body}
      </div>
    </div>
  )
}

function Input({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[10px] text-zinc-500 mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20" />
    </div>
  )
}
