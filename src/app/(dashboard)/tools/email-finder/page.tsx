'use client'

import { Mail, Search } from 'lucide-react'

export default function EmailFinderToolPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Email Finder</h2>
      <p className="text-zinc-400 text-sm mb-8">
        Email-Adresse für einen Lead über mehrere Provider finden.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Website URL</label>
            <input
              type="url"
              placeholder="https://doener-palace.de"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
              disabled
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Business Name</label>
            <input
              type="text"
              placeholder="Döner Palace"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
              disabled
            />
          </div>
        </div>

        <button
          disabled
          className="flex items-center gap-2 px-4 py-2.5 bg-white/10 text-zinc-500 rounded-lg text-sm font-medium cursor-not-allowed"
        >
          <Search size={16} /> Email finden
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
        <Mail size={32} className="mx-auto mb-3 text-zinc-700" />
        <p className="text-zinc-500 text-sm">Phase D — Email Provider werden hier angebunden.</p>
        <p className="text-zinc-600 text-xs mt-2">
          Providers: Website Scraper, GMaps, Hunter.io, Snov.io, Dropcontact
        </p>
      </div>
    </div>
  )
}
