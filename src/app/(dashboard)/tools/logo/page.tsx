import Link from 'next/link'
import { Image, ArrowLeft, Upload, Maximize, Eraser, Copy } from 'lucide-react'

export default function LogoPage() {
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
          <Image size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">Logo Processor</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        Logo URL oder Upload &rarr; Format Check, Dimension Check, Background Removal, Multi-Size Output
      </p>

      {/* Placeholder Upload Area */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="border-2 border-dashed border-zinc-700 rounded-lg p-10 text-center cursor-not-allowed opacity-50">
          <Upload size={32} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Logo hierher ziehen oder klicken zum Upload</p>
          <p className="text-xs text-zinc-600 mt-1">PNG, JPG, SVG — max. 5MB</p>
        </div>
      </div>

      {/* Phase Info Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-400 font-medium">
            Phase 3
          </span>
          <span className="text-sm text-zinc-500">Wird in Phase 3 implementiert</span>
        </div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Geplante Features:</h3>
        <ul className="space-y-2.5">
          {[
            { icon: Maximize, label: 'Format- und Dimensions-Check (min/max Größe, Ratio)' },
            { icon: Eraser, label: 'Automatische Background Removal via AI' },
            { icon: Copy, label: 'Multi-Size Output: 1x, 2x, 3x für Apple/Google Wallet' },
            { icon: Image, label: 'Preview aller generierten Varianten' },
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
