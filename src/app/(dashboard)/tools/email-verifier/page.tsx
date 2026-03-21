'use client'

import { ShieldCheck } from 'lucide-react'

export default function EmailVerifierToolPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Email Verifier</h2>
      <p className="text-zinc-400 text-sm mb-8">
        Email-Adressen auf Gültigkeit prüfen (valid / invalid / risky / unknown).
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="mb-4">
          <label className="block text-xs text-zinc-500 mb-1.5">Email-Adresse</label>
          <input
            type="email"
            placeholder="info@doener-palace.de"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 max-w-md"
            disabled
          />
        </div>

        <button
          disabled
          className="flex items-center gap-2 px-4 py-2.5 bg-white/10 text-zinc-500 rounded-lg text-sm font-medium cursor-not-allowed"
        >
          <ShieldCheck size={16} /> Verifizieren
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
        <ShieldCheck size={32} className="mx-auto mb-3 text-zinc-700" />
        <p className="text-zinc-500 text-sm">Phase D — ZeroBounce / MillionVerifier Anbindung.</p>
      </div>
    </div>
  )
}
