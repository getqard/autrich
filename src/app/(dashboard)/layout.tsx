'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Settings,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, match: (p: string) => p === '/' },
  { href: '/campaigns', label: 'Kampagnen', icon: Megaphone, match: (p: string) => p.startsWith('/campaigns') || p.startsWith('/scraping') },
  { href: '/leads', label: 'Leads', icon: Users, match: (p: string) => p.startsWith('/leads') },
  { href: '/settings', label: 'Settings', icon: Settings, match: (p: string) => p.startsWith('/settings') },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname() || '/'

  return (
    <div className="flex h-screen bg-zinc-950 text-white">
      <aside className="w-60 border-r border-zinc-800 flex flex-col overflow-y-auto">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-bold tracking-tight">AUTRICH</h1>
          <p className="text-xs text-zinc-500 mt-1">Cold Outreach Engine</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = item.match(pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-white text-black font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-zinc-800 text-xs text-zinc-600">
          Erfolgssinn LLC · Wyoming
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
