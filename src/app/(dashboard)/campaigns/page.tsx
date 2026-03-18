'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Upload, Loader2 } from 'lucide-react'
import type { Database } from '@/lib/supabase/types'

type Campaign = Database['public']['Tables']['campaigns']['Row']

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadCampaigns()
  }, [])

  async function loadCampaigns() {
    const res = await fetch('/api/campaigns')
    const data = await res.json()
    setCampaigns(data)
    setLoading(false)
  }

  async function createCampaign() {
    if (!newName.trim()) return
    setCreating(true)
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    if (res.ok) {
      setNewName('')
      setShowCreate(false)
      loadCampaigns()
    }
    setCreating(false)
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-zinc-700 text-zinc-300',
    processing: 'bg-amber-500/10 text-amber-400',
    ready: 'bg-blue-500/10 text-blue-400',
    active: 'bg-green-500/10 text-green-400',
    paused: 'bg-yellow-500/10 text-yellow-400',
    completed: 'bg-zinc-600 text-zinc-300',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold">Campaigns</h2>
          <p className="text-zinc-400">Manage your outreach campaigns</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          <Plus size={16} />
          New Campaign
        </button>
      </div>

      {/* Create Campaign Modal */}
      {showCreate && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 mb-6">
          <h3 className="font-semibold mb-4">Neue Kampagne erstellen</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createCampaign()}
              placeholder="z.B. Dönerläden Berlin März 2026"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
              autoFocus
            />
            <button
              onClick={createCampaign}
              disabled={creating || !newName.trim()}
              className="px-4 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : 'Erstellen'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName('') }}
              className="px-4 py-2.5 bg-zinc-800 rounded-lg text-sm text-zinc-400 hover:text-white"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Campaign List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-zinc-500" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-12 text-center">
          <p className="text-zinc-500">Noch keine Kampagnen erstellt.</p>
          <p className="text-zinc-600 text-sm mt-2">
            Erstelle eine Kampagne und lade eine CSV/Excel hoch um loszulegen.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{campaign.name}</h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    {campaign.total_leads} Leads
                    {' · '}
                    {new Date(campaign.created_at).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full ${statusColors[campaign.status] || statusColors.draft}`}>
                    {campaign.status}
                  </span>
                  {campaign.status === 'draft' && campaign.total_leads === 0 && (
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      <Upload size={12} /> CSV hochladen
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
