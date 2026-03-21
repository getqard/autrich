import Link from 'next/link'
import { Mail, ArrowLeft, UserCheck, Target, PenTool, Copy } from 'lucide-react'

export default function EmailPage() {
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
          <Mail size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">Email Writer</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        Lead-Daten + Strategie wählen &rarr; personalisierte Cold Email generieren
      </p>

      {/* Placeholder Form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Lead Name</label>
            <input
              type="text"
              placeholder="z.B. Mario Rossi"
              disabled
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-500 placeholder-zinc-600 cursor-not-allowed"
            />
          </div>
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
            <label className="block text-sm font-medium text-zinc-300 mb-2">Strategie</label>
            <select
              disabled
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-500 cursor-not-allowed appearance-none"
            >
              <option>Strategie wählen...</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Sprache</label>
            <select
              disabled
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-500 cursor-not-allowed appearance-none"
            >
              <option>Deutsch</option>
            </select>
          </div>
        </div>
        <button
          disabled
          className="px-5 py-2.5 bg-zinc-700 text-zinc-500 rounded-lg text-sm font-medium cursor-not-allowed"
        >
          Email generieren
        </button>

        {/* Output Placeholder */}
        <div className="mt-4 border border-zinc-800 rounded-lg bg-zinc-950 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-600">Generierte Email</span>
            <button disabled className="text-xs text-zinc-600 cursor-not-allowed flex items-center gap-1">
              <Copy size={12} />
              Kopieren
            </button>
          </div>
          <div className="h-32 flex items-center justify-center">
            <span className="text-sm text-zinc-700">Email-Output erscheint hier...</span>
          </div>
        </div>
      </div>

      {/* Phase Info Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs px-2 py-1 rounded bg-orange-500/10 text-orange-400 font-medium">
            Phase 8
          </span>
          <span className="text-sm text-zinc-500">Wird in Phase 8 implementiert</span>
        </div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Geplante Features:</h3>
        <ul className="space-y-2.5">
          {[
            { icon: UserCheck, label: 'Lead-Daten automatisch aus DB laden' },
            { icon: Target, label: 'Mehrere Email-Strategien (value-first, social-proof, etc.)' },
            { icon: PenTool, label: 'AI-generierte, personalisierte Subject Lines + Body' },
            { icon: Copy, label: 'One-Click Copy oder direkt in Queue einfügen' },
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
