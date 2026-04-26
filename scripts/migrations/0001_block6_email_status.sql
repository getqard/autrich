-- ─────────────────────────────────────────────────────────────
-- Block 6 — Instantly Integration: email_status Enum erweitern
-- ─────────────────────────────────────────────────────────────
--
-- Bestehende Werte: pending | review | queued | sent | opened | clicked
--                   | replied | bounced
--
-- Neu gebraucht für Block 6:
--   • sending       → Lead ist an Instantly raus, wartet auf 'sent'-Event
--   • unsubscribed  → Empfänger hat sich abgemeldet (terminal, blacklist)
--
-- Anwendung:
--   1) Supabase Dashboard → SQL Editor → diesen Block einfügen → Run
--   2) ODER via psql: psql "$DATABASE_URL" -f 0001_block6_email_status.sql
--
-- Hinweis: ALTER TYPE ADD VALUE läuft nicht in einer Transaktion;
-- jedes Statement muss eigenständig committen. Daher kein BEGIN/COMMIT.

ALTER TYPE email_status ADD VALUE IF NOT EXISTS 'sending';
ALTER TYPE email_status ADD VALUE IF NOT EXISTS 'unsubscribed';
