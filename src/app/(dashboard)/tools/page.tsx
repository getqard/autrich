import Link from 'next/link'
import {
  Globe,
  Image,
  Brain,
  Layers,
  Wallet,
  Smartphone,
  Mail,
  MessageSquare,
  ExternalLink,
} from 'lucide-react'

const tools = [
  {
    href: '/tools/scraper',
    icon: Globe,
    name: 'Website Scraper',
    description: 'URL eingeben → Logo, Farben, Meta-Daten, Social Links extrahieren',
    phase: 3,
  },
  {
    href: '/tools/logo',
    icon: Image,
    name: 'Logo Processor',
    description: 'Logo URL oder Upload → Verarbeitung, Sizes, Background Removal',
    phase: 3,
  },
  {
    href: '/tools/classifier',
    icon: Brain,
    name: 'AI Business Classifier',
    description: 'Business-Daten → Industry, Reward, Emoji, Email Hooks',
    phase: 3,
  },
  {
    href: '/tools/strip',
    icon: Layers,
    name: 'Strip Image Generator',
    description: 'Industry + Farbe → Template Preview oder AI-generiertes Strip Image',
    phase: 4,
  },
  {
    href: '/tools/pass',
    icon: Wallet,
    name: 'Pass Generator',
    description: 'Formular ausfüllen → Apple + Google Wallet Pass generieren + downloaden',
    phase: 5,
  },
  {
    href: '/tools/preview',
    icon: Smartphone,
    name: 'iPhone Preview',
    description: 'Pass-Daten → iPhone Mockup PNG generieren',
    phase: 7,
  },
  {
    href: '/tools/email',
    icon: Mail,
    name: 'Email Writer',
    description: 'Lead-Daten + Strategie → personalisierte Cold Email generieren',
    phase: 8,
  },
  {
    href: '/tools/reply',
    icon: MessageSquare,
    name: 'Reply Classifier',
    description: 'Antwort-Text → Kategorie (interested/not_now/etc.) + AI Draft',
    phase: 11,
  },
  {
    href: '/tools/download-page',
    icon: ExternalLink,
    name: 'Download Page Preview',
    description: 'Live-Preview der Download-Seite für Mobile + Desktop',
    phase: 6,
  },
]

export default function ToolsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Tools</h2>
      <p className="text-zinc-400 mb-8">
        Jede Komponente einzeln testen und debuggen. Gleiche Services wie in der Batch-Pipeline.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon
          const isAvailable = tool.phase <= 3 // Phase 3 fertig
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className={`bg-zinc-900 border rounded-xl p-5 transition-all ${
                isAvailable
                  ? 'border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50'
                  : 'border-zinc-900 opacity-50 pointer-events-none'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-zinc-800 rounded-lg">
                  <Icon size={18} className="text-zinc-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">{tool.name}</h3>
                    {!isAvailable && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                        Phase {tool.phase}
                      </span>
                    )}
                  </div>
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
