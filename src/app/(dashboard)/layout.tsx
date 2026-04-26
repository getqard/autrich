'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Settings,
  Inbox,
} from 'lucide-react'

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  match: (p: string) => boolean
  /** Optional badge content (e.g. unread count). */
  badgeKey?: 'inbox_unread'
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/' },
  { href: '/campaigns', label: 'Kampagnen', icon: Megaphone, match: (p) => p.startsWith('/campaigns') || p.startsWith('/scraping') },
  { href: '/leads', label: 'Leads', icon: Users, match: (p) => p.startsWith('/leads') },
  { href: '/inbox', label: 'Inbox', icon: Inbox, match: (p) => p.startsWith('/inbox'), badgeKey: 'inbox_unread' },
  { href: '/settings', label: 'Settings', icon: Settings, match: (p) => p.startsWith('/settings') },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname() || '/'
  const [inboxUnread, setInboxUnread] = useState<number>(0)

  // Poll Inbox-Badge alle 60s + bei Pathname-Wechsel
  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const res = await fetch('/api/inbox?unread_only=true&limit=1', { cache: 'no-store' })
        if (!cancelled && res.ok) {
          const data = await res.json()
          setInboxUnread(data.unread_count || 0)
        }
      } catch { /* ignore */ }
    }
    tick()
    const t = setInterval(tick, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [pathname])

  const badges: Record<string, number> = { inbox_unread: inboxUnread }

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
            const badge = item.badgeKey ? badges[item.badgeKey] : 0
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
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      active ? 'bg-black text-white' : 'bg-blue-500 text-white'
                    }`}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
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
