# Migrations

SQL-Migrationen für die Autrich-Datenbank (Supabase Postgres, Project `vqwydgtmgrdsbzpipnil`).

## Reihenfolge

| # | Datei | Block | Was tut sie? |
|---|-------|-------|--------------|
| 0001 | `0001_block6_email_status.sql` | 6 | erweitert `email_status` Enum um `sending` + `unsubscribed` |

## Anwendung

**Empfohlen: Supabase Dashboard**
1. https://supabase.com/dashboard → Projekt `vqwydgtmgrdsbzpipnil` → SQL Editor
2. Datei-Inhalt einfügen → "Run"
3. Nach erfolgreichem Run: kein Code-Deploy nötig — Werte sind sofort live

**Alternativ: psql / pg_dump-Connection**
```bash
psql "$SUPABASE_DB_URL" -f scripts/migrations/0001_block6_email_status.sql
```

## Konvention

- 4-stelliger Prefix (`NNNN_`) für Sortierung
- snake_case Beschreibung
- Idempotent wenn möglich (`IF NOT EXISTS`)
- Kein `BEGIN/COMMIT` bei `ALTER TYPE ADD VALUE` — Postgres erlaubt das nicht in Transaktionen
- Nach Anwendung in dieser Tabelle als „angewendet" markieren

## Status

- [ ] 0001 — Block 6 email_status enum (anzuwenden vor Block-6-Live)
