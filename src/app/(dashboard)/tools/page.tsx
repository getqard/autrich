import Link from 'next/link'
import { ArrowLeft, Globe, Brain, Layers, Wallet, Mail, ListChecks } from 'lucide-react'

const tools = [
  {
    href: '/tools/pipeline',
    icon: ListChecks,
    name: 'Pipeline Runner',
    description: 'URL → Step-by-Step Lead-Pipeline (Scrape → Logo → Farben → Klassifikation → Strip)',
  },
  {
    href: '/tools/scraper',
    icon: Globe,
    name: 'Website Scraper',
    description: 'URL eingeben → Logo, Farben, Meta-Daten, Social Links extrahieren',
  },
  {
    href: '/tools/classifier',
    icon: Brain,
    name: 'AI Business Classifier',
    description: 'Business-Daten → Industry, Reward, Emoji, Email Hooks',
  },
  {
    href: '/tools/strip',
    icon: Layers,
    name: 'Strip Image Generator',
    description: 'Industry + Farbe → Template Preview oder AI-generiertes Strip Image',
  },
  {
    href: '/tools/pass',
    icon: Wallet,
    name: 'Pass Generator',
    description: 'Formular ausfüllen → Apple + Google Wallet Pass generieren + downloaden',
  },
  {
    href: '/tools/email',
    icon: Mail,
    name: 'Email Writer',
    description: 'Lead-Daten + Strategie → personalisierte Cold Email generieren',
  },
]

export default function ToolsPage() {
  return (
    <div>
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white mb-4">
        <ArrowLeft size={14} /> Zurück zum Dashboard
      </Link>
      <h2 className="text-2xl font-bold mb-2">Dev-Tools</h2>
      <p className="text-zinc-400 mb-2">
        Einzel-Komponenten zum Testen und Debuggen. Nicht Teil des Produktions-Flows.
      </p>
      <p className="text-xs text-zinc-600 mb-8">
        Direkt-URL: <code className="text-zinc-500">/tools</code> — nicht in der Sidebar verlinkt.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50 rounded-xl p-5 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-zinc-800 rounded-lg">
                  <Icon size={18} className="text-zinc-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">{tool.name}</h3>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
