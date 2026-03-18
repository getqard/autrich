'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Search, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import type { Lead, PipelineStatus } from '@/lib/supabase/types'
import { INDUSTRIES } from '@/data/industries-seed'

const PIPELINE_COLORS: Record<PipelineStatus, string> = {
  new: 'bg-zinc-700 text-zinc-300',
  contacted: 'bg-blue-500/10 text-blue-400',
  engaged: 'bg-purple-500/10 text-purple-400',
  interested: 'bg-green-500/10 text-green-400',
  demo_scheduled: 'bg-emerald-500/10 text-emerald-400',
  converted: 'bg-green-600/10 text-green-300',
  warm: 'bg-amber-500/10 text-amber-400',
  lost: 'bg-red-500/10 text-red-400',
  blacklisted: 'bg-red-900/20 text-red-500',
}

function getIndustryEmoji(slug: string | null): string | null {
  if (!slug) return null
  return INDUSTRIES.find(i => i.slug === slug)?.emoji || null
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-zinc-500" /></div>}>
      <LeadsContent />
    </Suspense>
  )
}

function LeadsContent() {
  const searchParams = useSearchParams()
  const campaignFilter = searchParams.get('campaign_id')

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pipelineFilter, setPipelineFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const loadLeads = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', page.toString())
    params.set('limit', '30')
    if (campaignFilter) params.set('campaign_id', campaignFilter)
    if (pipelineFilter) params.set('pipeline_status', pipelineFilter)
    if (search) params.set('search', search)

    const res = await fetch(`/api/leads?${params}`)
    const data = await res.json()
    setLeads(data.leads || [])
    setTotalPages(data.pagination?.pages || 1)
    setTotal(data.pagination?.total || 0)
    setLoading(false)
  }, [page, campaignFilter, pipelineFilter, search])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  useEffect(() => {
    setPage(1)
  }, [search, pipelineFilter])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Leads</h2>
          <p className="text-zinc-400">{total} Leads{campaignFilter ? ' (gefiltert)' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Email oder Stadt suchen..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
          />
        </div>
        <select
          value={pipelineFilter}
          onChange={(e) => setPipelineFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
        >
          <option value="">Alle Status</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="engaged">Engaged</option>
          <option value="interested">Interested</option>
          <option value="demo_scheduled">Demo Scheduled</option>
          <option value="converted">Converted</option>
          <option value="warm">Warm</option>
          <option value="lost">Lost</option>
          <option value="blacklisted">Blacklisted</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-zinc-500" />
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-12 text-center">
          <p className="text-zinc-500">Keine Leads gefunden.</p>
        </div>
      ) : (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                  <th className="text-left px-4 py-3 font-medium">Business</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Stadt</th>
                  <th className="text-left px-4 py-3 font-medium">Branche</th>
                  <th className="text-left px-4 py-3 font-medium">Pipeline</th>
                  <th className="text-left px-4 py-3 font-medium">Enrichment</th>
                  <th className="text-left px-4 py-3 font-medium">Pass</th>
                  <th className="text-right px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const industrySlug = lead.detected_industry || lead.industry
                  const emoji = getIndustryEmoji(industrySlug)
                  const extraData = (lead.extra_data || {}) as Record<string, unknown>
                  const industryMethod = extraData.industry_method as string | undefined
                  const tooltipParts: string[] = []
                  if (lead.logo_source) tooltipParts.push(`Logo: ${lead.logo_source}`)
                  if (industryMethod) tooltipParts.push(`Industry: ${industryMethod}`)
                  const tooltip = tooltipParts.join(', ')

                  return (
                    <tr key={lead.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {lead.logo_url ? (
                            <img
                              src={lead.logo_url}
                              alt=""
                              className="w-6 h-6 rounded bg-zinc-800 object-contain flex-shrink-0"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded bg-zinc-800 flex-shrink-0" />
                          )}
                          <span className="font-medium">{lead.business_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{lead.email || <span className="text-zinc-600">—</span>}</td>
                      <td className="px-4 py-3 text-zinc-400">{lead.city || '—'}</td>
                      <td className="px-4 py-3 text-zinc-400">
                        {emoji && <span className="mr-1">{emoji}</span>}
                        {industrySlug || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${PIPELINE_COLORS[lead.pipeline_status]}`}>
                          {lead.pipeline_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusDot status={lead.enrichment_status} tooltip={tooltip} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusDot status={lead.pass_status} />
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400">{lead.lead_score}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/leads/${lead.id}`} className="text-zinc-500 hover:text-white">
                          <ExternalLink size={14} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-zinc-500">
                Seite {page} von {totalPages} ({total} Leads)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatusDot({ status, tooltip }: { status: string; tooltip?: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-zinc-600',
    processing: 'bg-amber-500',
    completed: 'bg-green-500',
    ready: 'bg-green-500',
    generating: 'bg-amber-500',
    failed: 'bg-red-500',
  }
  return (
    <div className="flex items-center gap-1.5 group relative">
      <div className={`w-2 h-2 rounded-full ${colors[status] || colors.pending}`} />
      <span className="text-xs text-zinc-500">{status}</span>
      {tooltip && (
        <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-10">
          <div className="bg-zinc-700 text-[10px] text-zinc-200 px-2 py-1 rounded whitespace-nowrap">
            {tooltip}
          </div>
        </div>
      )}
    </div>
  )
}
