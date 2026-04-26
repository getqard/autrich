'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Mail, MailOpen, Reply, ExternalLink, Filter as FilterIcon } from 'lucide-react'

type ReplyItem = {
  id: string
  business_name: string
  email: string
  contact_name: string | null
  city: string | null
  industry: string | null
  logo_url: string | null
  email_subject: string | null
  email_body: string | null
  email_replied_at: string | null
  reply_text: string | null
  reply_seen_at: string | null
  pipeline_status: string
  campaign_id: string | null
  campaigns: { id: string; name: string } | null
}

export default function InboxPage() {
  const [replies, setReplies] = useState<ReplyItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (unreadOnly) params.set('unread_only', 'true')
    const res = await fetch(`/api/inbox?${params}`)
    if (res.ok) {
      const data = await res.json()
      setReplies(data.replies)
      setUnreadCount(data.unread_count)
    }
    setLoading(false)
  }, [unreadOnly])

  useEffect(() => { load() }, [load])

  async function markSeen(leadId: string) {
    await fetch(`/api/inbox/${leadId}/seen`, { method: 'POST' })
    setReplies((prev) =>
      prev.map((r) => (r.id === leadId ? { ...r, reply_seen_at: new Date().toISOString() } : r)),
    )
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold">Inbox</h2>
          <p className="text-zinc-400">
            {unreadCount > 0
              ? `${unreadCount} ungelesene Antwort${unreadCount === 1 ? '' : 'en'}`
              : 'Alle Antworten gelesen'}
          </p>
        </div>
        <label className="text-xs text-zinc-500 inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded border-zinc-700 bg-zinc-800"
          />
          Nur ungelesene
        </label>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : replies.length === 0 ? (
          <EmptyInbox unreadOnly={unreadOnly} />
        ) : (
          <div className="space-y-3">
            {replies.map((reply) => (
              <ReplyCard key={reply.id} reply={reply} onMarkSeen={() => markSeen(reply.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ReplyCard({ reply, onMarkSeen }: { reply: ReplyItem; onMarkSeen: () => void }) {
  const isUnread = !reply.reply_seen_at
  const repliedAt = reply.email_replied_at ? new Date(reply.email_replied_at) : null
  const replyTextPreview = (reply.reply_text || '').slice(0, 240)

  return (
    <div
      className={`rounded-xl border p-5 transition-colors ${
        isUnread
          ? 'bg-blue-500/5 border-blue-500/30 hover:border-blue-500/50'
          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start gap-4">
        {reply.logo_url ? (
          <img src={reply.logo_url} alt="" className="w-10 h-10 rounded bg-zinc-800 object-contain flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded bg-zinc-800 flex-shrink-0 flex items-center justify-center">
            {isUnread ? <Mail size={18} className="text-blue-400" /> : <MailOpen size={18} className="text-zinc-600" />}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`font-semibold ${isUnread ? 'text-white' : 'text-zinc-300'}`}>{reply.business_name}</h3>
            {isUnread && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300">NEU</span>}
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">{reply.email}</span>
            {reply.campaigns && (
              <>
                <span className="text-xs text-zinc-600">·</span>
                <Link
                  href={`/campaigns/${reply.campaigns.id}`}
                  className="text-xs text-zinc-500 hover:text-white"
                >
                  {reply.campaigns.name}
                </Link>
              </>
            )}
          </div>

          {reply.email_subject && (
            <div className="text-xs text-zinc-500 mb-2">
              Betreff: <span className="text-zinc-400">{reply.email_subject}</span>
            </div>
          )}

          {replyTextPreview ? (
            <div className="bg-zinc-800/50 rounded-lg p-3 text-sm text-zinc-300 leading-relaxed">
              <Reply size={12} className="inline text-green-400 mr-1.5 -mt-0.5" />
              {replyTextPreview}
              {(reply.reply_text?.length || 0) > 240 && '…'}
            </div>
          ) : (
            <div className="text-sm text-zinc-500 italic">
              Antwort erhalten — Reply-Text nicht im Webhook-Payload enthalten. Auf Lead-Detail nachsehen.
            </div>
          )}

          <div className="flex items-center gap-3 mt-3 text-xs">
            {repliedAt && (
              <span className="text-zinc-600">
                {repliedAt.toLocaleString('de-DE', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            )}
            <Link
              href={`/leads/${reply.id}`}
              onClick={() => isUnread && onMarkSeen()}
              className="text-zinc-400 hover:text-white inline-flex items-center gap-1"
            >
              Lead öffnen <ExternalLink size={11} />
            </Link>
            {isUnread && (
              <button
                onClick={onMarkSeen}
                className="text-zinc-500 hover:text-white"
              >
                Als gelesen markieren
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyInbox({ unreadOnly }: { unreadOnly: boolean }) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
      <FilterIcon size={32} className="mx-auto text-zinc-600 mb-3" />
      <p className="text-zinc-400">
        {unreadOnly ? 'Keine ungelesenen Antworten.' : 'Noch keine Antworten erhalten.'}
      </p>
      <p className="text-zinc-600 text-sm mt-2">
        Sobald ein Empfänger antwortet, taucht es hier auf — der Webhook von Instantly schreibt direkt rein.
      </p>
    </div>
  )
}
