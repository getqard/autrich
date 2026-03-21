import Link from 'next/link'
import { Wallet, ArrowLeft, Apple, Smartphone, Download, FileCheck } from 'lucide-react'

export default function PassPage() {
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
          <Wallet size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">Pass Generator</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        Formular ausfüllen &rarr; Apple .pkpass + Google Wallet Pass generieren und downloaden
      </p>

      {/* Placeholder Form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Business Name</label>
            <input
              type="text"
              placeholder="z.B. Café Milano"
              disabled
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-500 placeholder-zinc-600 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Reward Text</label>
            <input
              type="text"
              placeholder="z.B. 1 Gratis Kaffee"
              disabled
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-500 placeholder-zinc-600 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Logo URL</label>
            <input
              type="text"
              placeholder="https://..."
              disabled
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-500 placeholder-zinc-600 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Primärfarbe</label>
            <input
              type="text"
              placeholder="#000000"
              disabled
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-500 placeholder-zinc-600 cursor-not-allowed"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button
            disabled
            className="px-5 py-2.5 bg-zinc-700 text-zinc-500 rounded-lg text-sm font-medium cursor-not-allowed"
          >
            Apple Pass generieren
          </button>
          <button
            disabled
            className="px-5 py-2.5 bg-zinc-700 text-zinc-500 rounded-lg text-sm font-medium cursor-not-allowed"
          >
            Google Pass generieren
          </button>
        </div>
      </div>

      {/* Phase Info Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs px-2 py-1 rounded bg-purple-500/10 text-purple-400 font-medium">
            Phase 5
          </span>
          <span className="text-sm text-zinc-500">Wird in Phase 5 implementiert</span>
        </div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Geplante Features:</h3>
        <ul className="space-y-2.5">
          {[
            { icon: Apple, label: 'Apple .pkpass Generierung mit Signierung' },
            { icon: Smartphone, label: 'Google Wallet Pass via JWT erstellen' },
            { icon: FileCheck, label: 'Automatische Validierung aller Pflichtfelder' },
            { icon: Download, label: 'Direkter Download beider Pass-Formate' },
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
