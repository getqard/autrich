'use client'

import { Map } from 'lucide-react'

export default function CoveragePage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Coverage</h2>
      <p className="text-zinc-400 text-sm mb-8">
        Welche Branche × Bundesland Kombinationen wurden bereits gescrapt.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
        <Map size={32} className="mx-auto mb-3 text-zinc-700" />
        <p className="text-zinc-500 text-sm">Noch keine Scrapes durchgeführt.</p>
        <p className="text-zinc-600 text-xs mt-2">
          Phase C — Coverage Matrix wird automatisch aus Scrape-Daten generiert.
        </p>
      </div>
    </div>
  )
}
