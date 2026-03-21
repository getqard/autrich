import Link from 'next/link'
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Wrench,
  BarChart3,
  Globe,
  Settings,
  Search,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/scraping', label: 'Scraping', icon: Search },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/tools', label: 'Tools', icon: Wrench },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/domains', label: 'Domains', icon: Globe },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const scrapingItems = [
  { href: '/scraping', label: 'Manuell' },
  { href: '/scraping/plans', label: 'Pläne' },
  { href: '/scraping/industries', label: 'Branchen' },
  { href: '/scraping/coverage', label: 'Coverage' },
]

const toolItems = [
  { href: '/tools/pipeline', label: 'Pipeline Runner', phase: '3.5' },
  { href: '/tools/scraper', label: 'Scraper Test', phase: 'B' },
  { href: '/tools/email-finder', label: 'Email Finder', phase: 'D' },
  { href: '/tools/email-verifier', label: 'Email Verifier', phase: 'D' },
  { href: '/tools/logo', label: 'Logo Processor', phase: '3' },
  { href: '/tools/classifier', label: 'AI Classifier', phase: '3' },
  { href: '/tools/strip', label: 'Strip Image', phase: '4' },
  { href: '/tools/pass', label: 'Pass Generator', phase: '5', disabled: true },
  { href: '/tools/preview', label: 'Preview', phase: '7', disabled: true },
  { href: '/tools/email', label: 'Email Writer', phase: '8', disabled: true },
  { href: '/tools/reply', label: 'Reply Classifier', phase: '11', disabled: true },
  { href: '/tools/download-page', label: 'Download Page', phase: '6', disabled: true },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-zinc-950 text-white">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 flex flex-col overflow-y-auto">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-bold tracking-tight">AUTRICH</h1>
          <p className="text-xs text-zinc-500 mt-1">Cold Outreach Engine</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors"
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
                {/* Scraping Sub-Navigation */}
                {item.href === '/scraping' && (
                  <div className="ml-6 mt-1 space-y-0.5 border-l border-zinc-800 pl-3">
                    {scrapingItems.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className="block px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                )}
                {/* Tools Sub-Navigation */}
                {item.href === '/tools' && (
                  <div className="ml-6 mt-1 space-y-0.5 border-l border-zinc-800 pl-3">
                    {toolItems.map((tool) => (
                      <Link
                        key={tool.href}
                        href={tool.href}
                        className={`block px-2 py-1.5 text-xs transition-colors ${
                          tool.disabled
                            ? 'text-zinc-700 cursor-not-allowed'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {tool.label}
                        {tool.disabled && (
                          <span className="ml-1 text-[10px] text-zinc-700">P{tool.phase}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        <div className="p-4 border-t border-zinc-800">
          <div className="text-xs text-zinc-600">
            Phase 3.5+4 — Cache + Strip
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  )
}
