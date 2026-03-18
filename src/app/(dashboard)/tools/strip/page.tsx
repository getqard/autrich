import Link from 'next/link'
import { Layers, ArrowLeft, Palette, LayoutTemplate, Sparkles, Download } from 'lucide-react'

export default function StripPage() {
  return (
    <div>
      <Link
        href="/tools"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Zurück zu Tools
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-zinc-800 rounded-lg">
          <Layers size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">Strip Image Generator</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        Industry + Farbe wählen &rarr; Template aus Bibliothek oder AI-generiert
      </p>

      {/* Placeholder Controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Industry</label>
            <select
              disabled
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-500 cursor-not-allowed appearance-none"
            >
              <option>Industry auswählen...</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Primärfarbe</label>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-zinc-700 rounded-lg border border-zinc-600" />
              <input
                type="text"
                placeholder="#000000"
                disabled
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-500 placeholder-zinc-600 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Placeholder Preview Area */}
        <div className="border border-zinc-800 rounded-lg bg-zinc-950 h-40 flex items-center justify-center">
          <span className="text-sm text-zinc-600">Strip Image Preview (1125 x 432 px)</span>
        </div>
      </div>

      {/* Phase Info Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-medium">
            Phase 4
          </span>
          <span className="text-sm text-zinc-500">Wird in Phase 4 implementiert</span>
        </div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Geplante Features:</h3>
        <ul className="space-y-2.5">
          {[
            { icon: LayoutTemplate, label: 'Template-Bibliothek nach Industry gefiltert' },
            { icon: Palette, label: 'Automatische Farbübernahme aus Scraper-Ergebnis' },
            { icon: Sparkles, label: 'AI-generierte Strip Images via DALL-E / Stable Diffusion' },
            { icon: Download, label: 'Download als PNG in Wallet-kompatibler Größe' },
          ].map((feature) => {
            const Icon = feature.icon
            return (
              <li key={feature.label} className="flex items-center gap-2.5 text-sm text-zinc-400">
                <Icon size={14} className="text-zinc-600 shrink-0" />
                {feature.label}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
