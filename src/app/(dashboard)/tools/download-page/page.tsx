import Link from 'next/link'
import { ExternalLink, ArrowLeft, Smartphone, Monitor, Palette, Eye } from 'lucide-react'

export default function DownloadPagePreview() {
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
          <ExternalLink size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">Download Page Preview</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        Live-Preview der Download-Seite wie sie ein Empfänger sehen würde (Mobile + Desktop)
      </p>

      {/* Placeholder Preview Frames */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <button
            disabled
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-500 rounded-lg text-sm cursor-not-allowed"
          >
            <Smartphone size={14} />
            Mobile
          </button>
          <button
            disabled
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-500 rounded-lg text-sm cursor-not-allowed"
          >
            <Monitor size={14} />
            Desktop
          </button>
        </div>

        {/* Mobile Frame Placeholder */}
        <div className="flex justify-center">
          <div className="w-80">
            <div className="border-2 border-zinc-700 rounded-[2rem] p-3 bg-zinc-950">
              <div className="bg-zinc-800 rounded-[1.5rem] h-[560px] flex flex-col items-center justify-center p-6">
                <div className="w-16 h-16 bg-zinc-700 rounded-2xl mb-4" />
                <div className="w-40 h-3 bg-zinc-700 rounded mb-2" />
                <div className="w-32 h-2 bg-zinc-700/50 rounded mb-6" />
                <div className="w-full h-10 bg-zinc-700 rounded-lg mb-3" />
                <div className="w-full h-10 bg-zinc-700/50 rounded-lg" />
                <div className="mt-auto">
                  <span className="text-[10px] text-zinc-600">Download Page Preview</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Phase Info Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 font-medium">
            Phase 6
          </span>
          <span className="text-sm text-zinc-500">Wird in Phase 6 implementiert</span>
        </div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Geplante Features:</h3>
        <ul className="space-y-2.5">
          {[
            { icon: Smartphone, label: 'Mobile-First Preview mit realistischem Device Frame' },
            { icon: Monitor, label: 'Desktop-Ansicht der Download-Seite' },
            { icon: Palette, label: 'Dynamische Farben und Branding aus Lead-Daten' },
            { icon: Eye, label: 'Live-Preview mit Echtzeit-Updates beim Bearbeiten' },
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
