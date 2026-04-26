-- ─────────────────────────────────────────────────────────────
-- Phase X1 — Reply-Inbox: reply_seen_at + reply_text Spalten
-- ─────────────────────────────────────────────────────────────
--
-- Damit Replies in der Inbox als "gelesen" markiert werden können (Badge-Counter)
-- und der Antwort-Text aus dem Webhook persistiert wird.
--
-- Anwendung:
--   Supabase Dashboard → SQL Editor → einfügen → Run
--
-- Idempotent — kann mehrfach laufen.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS reply_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_text TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_reply_unseen
  ON leads (email_replied_at DESC)
  WHERE email_status = 'replied' AND reply_seen_at IS NULL;
