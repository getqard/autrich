'use client'

/**
 * Universal Swipe Component — geteilt zwischen Triage (Stage 1),
 * Enrichment-Review (Stage 2) und Final Review (Stage 3).
 *
 * Features:
 * - Keyboard-Shortcuts (Enter=approve, Esc/←=reject, →=skip) — inputs/textareas werden ignoriert
 * - Progress-Bar + Stats
 * - Prefetch nächster Chunk bei <5 Leads Rest
 * - Done-Screen bei Abschluss
 * - Action-Loading-State (verhindert Double-Submit)
 * - Optional: Custom ExtraActions (z.B. "Re-enrich" für Stage 2)
 */

import { ReactNode, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Check, X, SkipForward, ArrowLeft } from 'lucide-react'

export type SwipeAction = 'approve' | 'reject' | 'skip' | string

export type ExtraAction = {
  key: string
  label: string
  icon?: ReactNode
  shortcut?: string
  onClick: () => void | Promise<void>
  className?: string
}

type Props<TLead extends { id: string }> = {
  campaignId: string
  stageLabel: string
  leads: TLead[]
  total: number
  loading: boolean
  currentIndex: number
  onIndexChange: (index: number) => void
  onLoadMore: (offset: number) => void | Promise<void>
  renderCard: (lead: TLead) => ReactNode
  onAction: (leadId: string, action: SwipeAction, lead: TLead) => Promise<void> | void
  canApprove?: (lead: TLead) => boolean
  extraActions?: (lead: TLead) => ExtraAction[]
  /** Wenn true: Approve-Button deaktivieren mit Tooltip */
  approveDisabledReason?: (lead: TLead) => string | null
}

export function SwipeBoard<TLead extends { id: string }>({
  campaignId,
  stageLabel,
  leads,
  total,
  loading,
  currentIndex,
  onIndexChange,
  onLoadMore,
  renderCard,
  onAction,
  extraActions,
  approveDisabledReason,
}: Props<TLead>) {
  const [actionLoading, setActionLoading] = useState(false)
  const [approved, setApproved] = useState(0)
  const [rejected, setRejected] = useState(0)
  const [skipped, setSkipped] = useState(0)

  const lead = leads[currentIndex]

  // Prefetch next batch
  useEffect(() => {
    if (currentIndex >= leads.length - 5 && leads.length < total && leads.length > 0) {
      onLoadMore(leads.length)
    }
  }, [currentIndex, leads.length, total, onLoadMore])

  const goNext = useCallback(() => {
    if (currentIndex < leads.length - 1) {
      onIndexChange(currentIndex + 1)
    }
  }, [currentIndex, leads.length, onIndexChange])

  const handle = useCallback(async (action: SwipeAction) => {
    if (!lead || actionLoading) return
    const disabled = action === 'approve' && approveDisabledReason?.(lead)
    if (disabled) return
    setActionLoading(true)
    try {
      await onAction(lead.id, action, lead)
      if (action === 'approve') setApproved(a => a + 1)
      else if (action === 'reject') setRejected(r => r + 1)
      else if (action === 'skip') setSkipped(s => s + 1)
      goNext()
    } finally {
      setActionLoading(false)
    }
  }, [lead, actionLoading, onAction, goNext, approveDisabledReason])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (actionLoading || !lead) return
      const target = e.target as HTMLElement
      // Ignoriere wenn Nutzer gerade tippt
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) return

      if (e.key === 'Enter') { e.preventDefault(); handle('approve') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handle('skip') }
      else if (e.key === 'ArrowLeft' || e.key === 'Escape') { e.preventDefault(); handle('reject') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lead, actionLoading, handle])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-500 mb-4">Keine Leads für {stageLabel}.</p>
        <Link href={`/campaigns/${campaignId}`} className="text-blue-400 hover:underline text-sm">
          Zurück zur Campaign
        </Link>
      </div>
    )
  }

  const isLastLead = currentIndex >= leads.length - 1 && leads.length >= total
  const done = isLastLead && currentIndex === leads.length - 1 && (approved + rejected + skipped) > 0
  const disabledReason = lead && approveDisabledReason?.(lead)
  const extras = lead && extraActions ? extraActions(lead) : []

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href={`/campaigns/${campaignId}`}
          className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm"
        >
          <ArrowLeft size={16} /> Campaign
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-400">
            {stageLabel} · {Math.min(currentIndex + 1, total)} / {total}
          </span>
          {approved > 0 && <span className="text-green-400">{approved} freigegeben</span>}
          {rejected > 0 && <span className="text-red-400">{rejected} abgelehnt</span>}
          {skipped > 0 && <span className="text-zinc-500">{skipped} übersprungen</span>}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-6">
        <div
          className="bg-blue-500 h-full rounded-full transition-all duration-300"
          style={{ width: `${total > 0 ? ((currentIndex + 1) / total * 100) : 0}%` }}
        />
      </div>

      {/* Card */}
      {lead && (
        <div className="mb-6">
          {renderCard(lead)}
        </div>
      )}

      {/* Action Buttons */}
      {lead && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={() => handle('reject')}
            disabled={actionLoading}
            className="flex items-center gap-2 px-6 py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <X size={18} />
            Ablehnen
            <kbd className="ml-2 text-[10px] text-red-400/50 bg-red-400/10 px-1.5 py-0.5 rounded">Esc</kbd>
          </button>

          <button
            onClick={() => handle('skip')}
            disabled={actionLoading}
            className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <SkipForward size={18} />
            Weiter
            <kbd className="ml-2 text-[10px] text-zinc-500/50 bg-zinc-700/50 px-1.5 py-0.5 rounded">→</kbd>
          </button>

          {extras.map(ex => (
            <button
              key={ex.key}
              onClick={ex.onClick}
              disabled={actionLoading}
              className={ex.className || 'flex items-center gap-2 px-6 py-3 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-50'}
            >
              {ex.icon}
              {ex.label}
              {ex.shortcut && (
                <kbd className="ml-2 text-[10px] opacity-60 bg-white/10 px-1.5 py-0.5 rounded">{ex.shortcut}</kbd>
              )}
            </button>
          ))}

          <button
            onClick={() => handle('approve')}
            disabled={actionLoading || !!disabledReason}
            title={disabledReason || undefined}
            className="flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-green-600/20"
          >
            {actionLoading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Freigeben
            <kbd className="ml-2 text-[10px] text-green-300/50 bg-green-500/30 px-1.5 py-0.5 rounded">Enter</kbd>
          </button>
        </div>
      )}

      <p className="text-center text-[10px] text-zinc-700 mt-4">
        Tastatur: Esc/← = Ablehnen · → = Weiter · Enter = Freigeben
      </p>

      {done && (
        <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
          <p className="text-lg font-semibold mb-2">{stageLabel} abgeschlossen</p>
          <p className="text-zinc-400 text-sm mb-4">
            {approved} freigegeben, {rejected} abgelehnt, {skipped} übersprungen
          </p>
          <Link
            href={`/campaigns/${campaignId}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
          >
            Zurück zur Campaign
          </Link>
        </div>
      )}
    </div>
  )
}
