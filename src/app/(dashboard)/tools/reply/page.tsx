import Link from 'next/link'
import { MessageSquare, ArrowLeft, Tag, Zap, PenLine, BarChart3 } from 'lucide-react'

export default function ReplyPage() {
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
          <MessageSquare size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold">Reply Classifier</h2>
      </div>
      <p className="text-zinc-400 mb-8">
        Antwort-Text einfügen &rarr; AI klassifiziert (interested/not_now/question/etc.) + Draft Reply
      </p>

      {/* Placeholder Input */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-300 mb-2">Antwort-Text</label>
          <textarea
            placeholder="Email-Antwort hier einfügen..."
            disabled
            rows={5}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-500 placeholder-zinc-600 cursor-not-allowed resize-none"
          />
        </div>
        <button
          disabled
          className="px-5 py-2.5 bg-zinc-700 text-zinc-500 rounded-lg text-sm font-medium cursor-not-allowed"
        >
          Klassifizieren
        </button>

        {/* Output Placeholder */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-4">
            <span className="text-xs text-zinc-600 block mb-2">Klassifikation</span>
            <div className="h-16 flex items-center justify-center">
              <span className="text-sm text-zinc-700">—</span>
            </div>
          </div>
          <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-4">
            <span className="text-xs text-zinc-600 block mb-2">Confidence</span>
            <div className="h-16 flex items-center justify-center">
              <span className="text-sm text-zinc-700">—</span>
            </div>
          </div>
          <div className="md:col-span-2 border border-zinc-800 rounded-lg bg-zinc-950 p-4">
            <span className="text-xs text-zinc-600 block mb-2">Draft Reply</span>
            <div className="h-20 flex items-center justify-center">
              <span className="text-sm text-zinc-700">AI-generierte Antwort erscheint hier...</span>
            </div>
          </div>
        </div>
      </div>

      {/* Phase Info Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs px-2 py-1 rounded bg-rose-500/10 text-rose-400 font-medium">
            Phase 11
          </span>
          <span className="text-sm text-zinc-500">Wird in Phase 11 implementiert</span>
        </div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Geplante Features:</h3>
        <ul className="space-y-2.5">
          {[
            { icon: Tag, label: 'Kategorien: interested, not_now, question, unsubscribe, bounce' },
            { icon: Zap, label: 'Confidence Score für jede Klassifikation' },
            { icon: PenLine, label: 'AI Draft Reply basierend auf Kategorie und Kontext' },
            { icon: BarChart3, label: 'Batch-Klassifikation für mehrere Antworten' },
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
