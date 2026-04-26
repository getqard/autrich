/**
 * Instantly.ai API v2 — Client Wrapper
 *
 * Docs: https://developer.instantly.ai/
 * Auth:  Bearer ${INSTANTLY_API_KEY}
 * Base:  https://api.instantly.ai/api/v2 (override via INSTANTLY_BASE_URL)
 *
 * Architektur-Annahmen:
 * - 1 Instantly-Campaign pro Autrich-Campaign (instantly_campaign_id auf
 *   campaigns-Tabelle).
 * - Sequence-Steps nutzen Custom-Variables. Pro Lead pushen wir
 *   {{custom_subject_initial}}, {{custom_body_initial}}, plus die zwei
 *   Follow-up-Paare. So muss in Instantly nicht jede Variante manuell
 *   editiert werden.
 * - Webhook-Events kommen async; Dedup über instantly_event_id (UNIQUE
 *   in email_events-Tabelle).
 *
 * Retry-Verhalten: 429 → exponentielles Backoff (3×). 5xx → 1× Retry.
 * Andere Fehler werden als InstantlyApiError geworfen — Caller handlen.
 */

const BASE = process.env.INSTANTLY_BASE_URL || 'https://api.instantly.ai/api/v2'

export class InstantlyApiError extends Error {
  constructor(
    public status: number,
    public endpoint: string,
    public body: unknown,
  ) {
    super(`Instantly ${endpoint} failed [${status}]: ${JSON.stringify(body).slice(0, 300)}`)
    this.name = 'InstantlyApiError'
  }
}

// ─── Core Request ────────────────────────────────────────────────

type RequestOpts = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
  /** Override default retry behaviour (default: enabled). */
  noRetry?: boolean
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const apiKey = process.env.INSTANTLY_API_KEY
  if (!apiKey) throw new Error('INSTANTLY_API_KEY not set')

  const method = opts.method || (opts.body !== undefined ? 'POST' : 'GET')

  const url = new URL(`${BASE}${path.startsWith('/') ? path : `/${path}`}`)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  }
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body)

  const maxAttempts = opts.noRetry ? 1 : 4
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response
    try {
      res = await fetch(url.toString(), init)
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        await sleep(500 * attempt)
        continue
      }
      throw err
    }

    if (res.ok) {
      const text = await res.text()
      if (!text) return {} as T
      try {
        return JSON.parse(text) as T
      } catch {
        return text as unknown as T
      }
    }

    // 429 → exponentielles Backoff bis Attempt 4
    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 2 ** attempt
      await sleep(retryAfter * 1000)
      continue
    }

    // 5xx → 1× Retry
    if (res.status >= 500 && res.status < 600 && attempt < 2) {
      await sleep(750)
      continue
    }

    let bodyJson: unknown = null
    try { bodyJson = await res.json() } catch { /* nicht JSON */ }
    throw new InstantlyApiError(res.status, `${method} ${path}`, bodyJson)
  }

  throw lastError instanceof Error ? lastError : new Error('Instantly request failed')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── Campaign Types ──────────────────────────────────────────────

export type SequenceStep = {
  /** Days after previous step (0 = initial). */
  delay: number
  variants: Array<{ subject: string; body: string }>
}

export type CreateCampaignInput = {
  name: string
  /** Tägliches Send-Limit (Instantly empfiehlt warmgefahrene 30-50/day). */
  daily_limit?: number
  /** Sender-Account-IDs aus Instantly (in Instantly-UI angelegt). */
  email_accounts?: string[]
  /** 3-Step-Sequence (Initial + 2 Follow-ups). */
  sequence?: SequenceStep[]
  /** Stop-Bedingungen — auf Reply/Bounce/Unsub stoppen ist Default. */
  stop_on_reply?: boolean
  stop_on_auto_reply?: boolean
}

export type InstantlyCampaign = {
  id: string
  name: string
  status: string
  created_at?: string
  [key: string]: unknown
}

export type AddLeadsInput = {
  campaign_id: string
  leads: Array<{
    email: string
    first_name?: string
    last_name?: string
    company_name?: string
    /** Custom-Variables fließen in {{key}}-Templates der Sequence-Steps. */
    custom_variables?: Record<string, string | number | null>
  }>
}

// ─── Campaign Operations ─────────────────────────────────────────

export function createCampaign(input: CreateCampaignInput) {
  return request<InstantlyCampaign>('/campaigns', { method: 'POST', body: input })
}

export function getCampaign(id: string) {
  return request<InstantlyCampaign>(`/campaigns/${id}`)
}

export function updateCampaign(id: string, patch: Partial<CreateCampaignInput>) {
  return request<InstantlyCampaign>(`/campaigns/${id}`, { method: 'PATCH', body: patch })
}

export function pauseCampaign(id: string) {
  return request<InstantlyCampaign>(`/campaigns/${id}/pause`, { method: 'POST' })
}

export function resumeCampaign(id: string) {
  return request<InstantlyCampaign>(`/campaigns/${id}/activate`, { method: 'POST' })
}

export function deleteCampaign(id: string) {
  return request<{ success: boolean }>(`/campaigns/${id}`, { method: 'DELETE' })
}

// ─── Lead Operations ─────────────────────────────────────────────

export function addLeadsToCampaign(input: AddLeadsInput) {
  return request<{ uploaded: number; duplicates?: number }>('/leads', {
    method: 'POST',
    body: input,
  })
}

export type InstantlyLead = {
  id: string
  email: string
  status?: string
  campaign_id?: string
  [key: string]: unknown
}

export function getLeadStatus(leadId: string) {
  return request<InstantlyLead>(`/leads/${leadId}`)
}

export function listLeads(opts: { campaign_id?: string; status?: string; limit?: number } = {}) {
  return request<{ leads: InstantlyLead[]; total?: number }>('/leads', {
    query: { campaign_id: opts.campaign_id, status: opts.status, limit: opts.limit },
  })
}

// ─── Analytics ───────────────────────────────────────────────────

export type CampaignAnalytics = {
  campaign_id: string
  emails_sent: number
  emails_opened: number
  emails_clicked: number
  replies: number
  bounces: number
  unsubscribes: number
  [key: string]: unknown
}

export function getCampaignAnalytics(campaignId: string) {
  return request<CampaignAnalytics>('/campaigns/analytics', {
    query: { campaign_id: campaignId },
  })
}

// ─── Webhook Signature Validation ────────────────────────────────

/**
 * Validates an Instantly webhook signature (HMAC-SHA256 over raw body).
 * Header-Name kann variieren je nach Instantly-Konfig — wir akzeptieren
 * "x-instantly-signature" und "x-webhook-signature".
 */
export async function verifyWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = process.env.INSTANTLY_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[instantly] INSTANTLY_WEBHOOK_SECRET not set — webhook signature check skipped')
    return false
  }
  if (!signature) return false

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time compare (length first, then char-by-char)
  const provided = signature.replace(/^sha256=/i, '').toLowerCase()
  if (provided.length !== hex.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= provided.charCodeAt(i) ^ hex.charCodeAt(i)
  return diff === 0
}
