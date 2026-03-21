import Link from 'next/link'
import { Smartphone, ArrowLeft, Monitor, ImageDown, Eye, Paintbrush } from 'lucide-react'

export default function PreviewPage() {
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
          <Smartphone size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">iPhone Preview Generator</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        Pass-Daten eingeben &rarr; iPhone Mockup PNG generieren und downloaden
      </p>

      {/* Placeholder Preview Area */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="flex gap-6">
          {/* Mock iPhone frame */}
          <div className="w-64 shrink-0">
            <div className="border-2 border-zinc-700 rounded-[2rem] p-3 bg-zinc-950">
              <div className="bg-zinc-800 rounded-[1.5rem] h-[480px] flex items-center justify-center">
                <div className="text-center">
                  <Smartphone size={40} className="text-zinc-700 mx-auto mb-2" />
                  <span className="text-xs text-zinc-600">iPhone Preview</span>
                </div>
              </div>
            </div>
          </div>
          {/* Controls placeholder */}
          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Pass ID / Daten</label>
              <input
                type="text"
                placeholder="Pass-Daten eingeben..."
                disabled
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-500 placeholder-zinc-600 cursor-not-allowed"
              />
            </div>
            <button
              disabled
              className="px-5 py-2.5 bg-zinc-700 text-zinc-500 rounded-lg text-sm font-medium cursor-not-allowed"
            >
              Preview generieren
            </button>
            <button
              disabled
              className="ml-3 px-5 py-2.5 bg-zinc-700 text-zinc-500 rounded-lg text-sm font-medium cursor-not-allowed"
            >
              PNG downloaden
            </button>
          </div>
        </div>
      </div>

      {/* Phase Info Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs px-2 py-1 rounded bg-teal-500/10 text-teal-400 font-medium">
            Phase 7
          </span>
          <span className="text-sm text-zinc-500">Wird in Phase 7 implementiert</span>
        </div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Geplante Features:</h3>
        <ul className="space-y-2.5">
          {[
            { icon: Monitor, label: 'Realistischer iPhone 15 Mockup mit Wallet-Screen' },
            { icon: Paintbrush, label: 'Dynamische Farben und Logo aus Pass-Daten' },
            { icon: Eye, label: 'Live-Preview vor dem Export' },
            { icon: ImageDown, label: 'Export als PNG in hoher Auflösung' },
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
