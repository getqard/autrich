# Autrich — Masterplan (Phase 6-10)

> **Zweck dieses Dokuments**
> Vollständige Referenz, mit der Claude Code zwischen beliebigen Sessions weiterarbeiten kann. Wenn du den Kontext cleanst, reicht es aus, Claude zu sagen: *"Lies MASTERPLAN.md und starte Block X."* — alle nötigen Infos sind hier drin.

---

## 1. Projekt-Übersicht

**Autrich** ist ein All-in-One Cold-Email-Outreach-Tool für lokale Unternehmen in Deutschland. Zielgruppe: 1500+ Kunden. Pro Lead wird automatisch eine personalisierte Apple/Google Wallet Treuekarte als Demo generiert, ein Mockup dazu gerendert und eine personalisierte Email mit AI geschrieben.

**Founder:** Lano Aziz (betreibt parallel Passify SaaS, bringt tiefe Wallet-Pass-Expertise mit).
**LLC:** Erfolgssinn (genauer Rechtsform & Adresse siehe Block 5).

### Domain-Architektur
- `autrich.vercel.app` — Dashboard, nur für Lano
- `deine-treuekarte.de` — Download-Seite für Leads (neutrale, produktbezogene Domain)
- Middleware (`src/middleware.ts`) trennt Pfade nach Hostname

### Tech-Stack
- **Next.js 16.1.7** App Router, deployed auf Vercel (Fluid Compute, `maxDuration=300`)
- **Supabase** (Postgres + Storage + Auth), Projekt-ID `vqwydgtmgrdsbzpipnil`
- **Anthropic Claude Haiku 4.5** für Email-Generation und Klassifikation
- **passkit-generator** (Apple Wallet) + **Google Wallet JWT**
- **Instantly.ai API v2** für Email-Versand (noch nicht integriert, Block 6)
- **Satori** geplant für Mockup-PNG-Rendering (Block 4)

---

## 2. Aktueller Status (Stand 2026-04-21)

### Abgeschlossene Phasen (auf `main` gemerged)

| Phase | Feature | Commit |
|-------|---------|--------|
| 1 | Rating-Filter (nur ≥4.5 Sterne & ≥200 Reviews in Emails) | `77eceda` |
| 2 | Email-Varianten als `email_variants` JSONB | `77eceda` |
| 3 | Batch-Pipeline (10 Leads/Chunk, Progress-Polling) | `77eceda` |
| 4 | QC Review Flow (Tinder-Style unter `/campaigns/[id]/review`) | `eb8acc5` |
| 5 | Download-Domain `deine-treuekarte.de` + Middleware + URL-Fixes | `c3f50b6`, `fdc4f49`, `1653409` |

### Offene Phasen (dieses Dokument)

- **Block 1:** DB-Migrationen
- **Block 2:** A/B Testing Umstellung (von 5 Emails pro Lead auf 1)
- **Block 3:** Swipe-Infrastruktur (3 Stages)
- **Block 4:** Mockup-Generator (Apple Wallet UI)
- **Block 5:** Impressum, Datenschutz, Email-Footer
- **Block 6:** Instantly.ai Integration
- **Block 7:** Follow-ups (2 Stufen, 3+7 Tage)
- **Block 8:** Analytics Dashboard
- **Block 9:** Extras (Campaign-Pause, Lead-Priorisierung)

---

## 3. User-Entscheidungen (Quelle der Wahrheit)

Diese Entscheidungen hat Lano getroffen. Claude soll sie in jedem Block als Grundlage nehmen und nicht erneut zur Diskussion stellen, außer sie würden einem anderen Block widersprechen.

### A/B Testing
- **A1 Verteilung:** Zufällige Gleichverteilung über 5 Strategien (20% pro Strategie, ausgeglichen pro Campaign). *Explore+Exploit kann später umcodiert werden.*
- **A2 Override:** Im QC-Review kann Lano die zugewiesene Strategie manuell überschreiben. Override wird in `leads.ab_group_override = true` getrackt und von A/B-Analytics ausgeschlossen.
- **Strategien:** `curiosity`, `social_proof`, `direct`, `storytelling`, `provocation`

### Swipe-Features (3 Stages)
- **Stage 1 (Triage, nach Scraping):** Maximum an Info zeigen (Name, Rating, Kategorie, Stadt, Telefon, Website, Insta, Öffnungszeiten, Google-Maps-Preview).
- **Stage 2 (Enrichment-Review, nach Enrichment vor Pass):** Logo, Farben, AI-Klassifikation (Branche + Geschenk + Hooks), Impressum-Daten. **Inline-Edit für:** Logo ändern, Farben ändern, Geschenk/Reward ändern, Branche ändern, Kontakt-Email ändern.
- **Stage 3 (Final Review, bestehend, erweitern):** Pass-Preview + Email + Mockup-PNG. Inline-Edit für Farben, Strategie wechseln (live neu generieren), Subject/Body manuell, Reward ändern (regeneriert Pass + Email).
- **Aktionen überall:** Approve / Reject (blacklist) / Skip
- **Sortierung:** `lead_score DESC` (beste zuerst)
- **Keyboard-Shortcuts:** überall (Enter=Approve, Esc=Reject, Pfeile, 1-5 für Strategie)

### Mockup-PNG
- **Stil:** Apple Wallet UI (nicht iPhone-Lock-Screen)
- **Muss perfekt aussehen.** Lano liefert Screenshots beim Start von Block 4.
- **Format:** Claude entscheidet nach Deliverability-Kriterien (Inline via CID, PNG < 150 KB, max 1 Bild pro Email)

### Impressum & Compliance
- **LLC-Name** im Email-Footer (nicht nur Lano als Person)
- **Button-Lösung ist erlaubt** (BGH 1-Klick-Regel, §5 TMG): Minimaler Text-Footer + "Impressum"-Link reicht, wenn die verlinkte Seite vollständig ist.
- **Umsetzung:** Minimaler Footer mit Name + LLC + Stadt, plus Links zu `/impressum`, `/datenschutz`, `/unsubscribe` (letzterer von Instantly)
- **Impressum-Seite** auf `deine-treuekarte.de/impressum` (vollständig gemäß §5 TMG)
- **Abmelde-Link:** Instantly's built-in `{{unsubscribe_link}}` nutzen

### Instantly-Integration
- **Sending-Setup:** Separate Domains (mehrere, für Volume). Warmup-Phase **noch nicht** durchgelaufen — muss vor dem Versand komplett sein (2-3 Wochen pro Domain in Instantly).
- **Campaign-Mapping:** 1 Instantly-Campaign pro Autrich-Campaign
- **Sequence:** Initial + 2 Follow-ups (3 Tage, 7 Tage) direkt in Instantly als Sequence konfiguriert

### Follow-ups
- **2 Stufen:** +3 Tage, +7 Tage nach Initial
- **Strategie:** Eskalationsstufen
  - Initial: zugewiesene A/B-Strategie
  - Follow-up 1 (+3 Tage): gleiche Strategie, soft reminder
  - Follow-up 2 (+7 Tage): "direct" Strategie (letzte Chance, Ja/Nein-Abfrage)
- **Stop-Conditions:** Reply / Bounce / Unsubscribe stoppen sofort. Opened-aber-nicht-geklickt: **weiter schicken**. Geklickt-aber-nicht-konvertiert: **weiter schicken**.

### Analytics Dashboard (alles auf einmal)
- Funnel (Scraped → Enriched → Approved → Sent → Opened → Clicked → Replied → Converted)
- Strategie-Vergleich (welche A/B-Gruppe gewinnt)
- Branchen-Vergleich (welche Branchen konvertieren)
- Zeit-Analyse (Heatmap Versand-Uhrzeit/Wochentag)
- Campaign-Vergleich

### Reply-Handling
- **Erstmal manuell** (Lano beantwortet in Instantly/Gmail selbst)
- **Keine Intent-Klassifikation** initial (kommt später)

### Sonstiges
- **Sprache:** Alle Emails erstmal Deutsch
- **Lead-Priorisierung:** Nach `lead_score DESC` in allen Listen und Swipes
- **Duplikate:** Blacklist-Check beim Campaign-Import (bereits implementiert)
- **Campaign-Pause:** Ja, Button auf Campaign-Detail-Seite (Block 9)

---

## 4. Kompletter Workflow (vom Scrapen bis Send)

```
┌──────────────────────────────────────────────────────────────┐
│ STAGE 1: SOURCING                                            │
│  GMaps-Scraping (Branche + Stadt) → Leads in DB              │
│  Optional: SWIPE #1 (Triage) auf /campaigns/[id]/triage      │
│    → minimale Infos, Unpassende schnell raus                 │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ STAGE 2: ENRICHMENT                                          │
│  Batch-Pipeline: Website-Scrape + Logo + Farben + Impressum  │
│    + AI-Klassifikation (Branche, Geschenk, Hooks)            │
│  Optional: SWIPE #2 (Enrichment-Review) auf                  │
│    /campaigns/[id]/enrichment-review                         │
│    → Daten-Qualität prüfen, inline editieren                 │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ STAGE 3: GENERATION                                          │
│  A/B-Zuweisung (zufällig gleichverteilt, 1 von 5 Strategien) │
│  Pass-Generierung (Apple + Google Wallet)                    │
│  Email-Generation (nur die 1 zugewiesene Strategie)          │
│  Mockup-PNG rendern (Apple Wallet UI)                        │
│  Follow-up-Emails vorgenerieren (2 Stufen)                   │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ STAGE 4: QC REVIEW (SWIPE #3, verpflichtend)                 │
│  /campaigns/[id]/review                                      │
│  Pass + Email + Mockup-PNG ansehen, Approve/Reject           │
│  Inline-Edits möglich (Farben, Strategie, Reward, Body)      │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ STAGE 5: SENDING                                             │
│  Approved Leads → Upload zu Instantly                        │
│  (mit Mockup als Inline-Image + Footer mit Impressum-Link)   │
│  Instantly handhabt Warmup, Timing, Bounce, Sequence         │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ STAGE 6: TRACKING                                            │
│  Webhooks von Instantly: opened / clicked / replied /        │
│    bounced / unsubscribed                                    │
│  → email_events Tabelle, Lead-Status-Update                  │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ STAGE 7: FOLLOW-UPS (automatisch via Instantly-Sequence)     │
│  +3 Tage: Follow-up 1 (soft reminder)                        │
│  +7 Tage: Follow-up 2 (letzte Chance, direct)                │
│  Stop bei Reply/Bounce/Unsubscribe                           │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ STAGE 8: ANALYTICS                                           │
│  /analytics: Funnel + Strategie + Branche + Zeit + Campaign  │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Progress-Übersicht

| Block | Status | Start-Prompt (siehe jeweiligen Abschnitt) |
|-------|--------|-------------------------------------------|
| 1. DB-Migrationen | ✅ Fertig (`27287b6`) | `Starte Block 1: DB-Migrationen aus MASTERPLAN.md.` |
| 2. A/B Testing Umstellung | ✅ Fertig (`c2d6f36`) | `Starte Block 2: A/B Testing Umstellung aus MASTERPLAN.md.` |
| 3. Swipe-Infrastruktur | ✅ Fertig | `Starte Block 3: Swipe-Infrastruktur aus MASTERPLAN.md.` |
| 4. Mockup-Generator | ✅ Fertig | `Starte Block 4: Mockup-Generator aus MASTERPLAN.md.` |
| 5. Impressum & Footer | ✅ Fertig (Platzhalter — echte LLC-Daten via Vercel ENV setzen) | `Starte Block 5: Impressum & Footer aus MASTERPLAN.md.` |
| 6. Instantly Integration | ⬜ Offen | `Starte Block 6: Instantly Integration aus MASTERPLAN.md.` |
| 7. Follow-ups | ⬜ Offen | `Starte Block 7: Follow-ups aus MASTERPLAN.md.` |
| 8. Analytics Dashboard | ⬜ Offen | `Starte Block 8: Analytics aus MASTERPLAN.md.` |
| 9. Extras | ⬜ Offen | `Starte Block 9: Extras aus MASTERPLAN.md.` |

> Claude soll nach Abschluss eines Blocks den Status auf ✅ Fertig setzen und das Commit-SHA ergänzen.

---

## 6. User-Inputs (Was Lano liefern muss)

| Input | Wann benötigt | Was genau |
|-------|---------------|-----------|
| `NEXT_PUBLIC_DOWNLOAD_BASE_URL` in Vercel | Vor Block 1 | Wert: `https://deine-treuekarte.de` |
| Vercel-Domain `deine-treuekarte.de` | Vor Block 1 | DNS A-Record auf `76.76.21.21`, Domain in Vercel-Projekt hinzugefügt |
| Apple Wallet Screenshots | Block 4 | 4 Screenshots: Lock Screen, App-Vollansicht, Pass-Liste, Pass-Back |
| LLC-Daten | Block 5 | Firmenname (genaue Rechtsform), Geschäftsadresse, Vertretungsberechtigte, Handelsregister (falls relevant), USt-ID, Impressum-Email |
| Instantly API-Key | Block 6 | In Vercel als `INSTANTLY_API_KEY` |
| Sending-Domains | Block 6 | Liste der Domains mit Absender-Email (z.B. `lano@xyz.de`) |
| Warmup-Bestätigung | Vor echtem Versand | Alle Sending-Domains müssen in Instantly ≥14 Tage Warmup haben |

---

## 7. Environment-Variablen (Vercel + lokal)

| Variable | Zweck | Status |
|----------|-------|--------|
| `NEXT_PUBLIC_BASE_URL` | Platform-URL (autrich.vercel.app) | gesetzt |
| `NEXT_PUBLIC_DOWNLOAD_BASE_URL` | Download-Domain | **zu setzen** |
| `SUPABASE_URL` | Supabase-Projekt | gesetzt |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Admin | gesetzt |
| `ANTHROPIC_API_KEY` | Claude API | gesetzt |
| `APPLE_WALLET_*` | Apple Wallet Certs | gesetzt |
| `GOOGLE_WALLET_*` | Google Wallet Credentials | gesetzt |
| `INSTANTLY_API_KEY` | Instantly API v2 | **zu setzen (Block 6)** |
| `INSTANTLY_WEBHOOK_SECRET` | Webhook-Validierung | **zu setzen (Block 6)** |

---

## 8. Cross-Cutting Concerns

Diese Themen müssen in jedem Block mitgedacht werden.

### 8.1 Deliverability (nicht im Spam landen)
- **PNG-Größe < 150 KB** im Email-Body
- **Max 1 Bild pro Email** (Mockup)
- **Text-zu-HTML-Verhältnis** > 60% Text
- **Keine Link-Kürzer** (bit.ly etc.)
- **Max 2 Links** pro Email (Download + Impressum, Abmelden zählt separat durch Instantly)
- **Kein "click here"** als Link-Text (Spam-Trigger)
- **SPF/DKIM/DMARC** auf allen Sending-Domains (wird in Instantly konfiguriert)
- **Warmup** vor echtem Versand (Lano noch zu erledigen)

### 8.2 DSGVO & TMG-Compliance
- **Opt-out in jeder Email** (Instantly built-in reicht)
- **Impressum per 1-Klick erreichbar** (BGH-konform)
- **Datenverarbeitung dokumentiert** (Datenschutz-Seite)
- **Lead-Daten nur für genannten Zweck** (Treuekarten-Demo)
- **Blacklist auf Unsubscribe-Request** (automatisch via Webhook)

### 8.3 Performance
- **Vercel maxDuration = 300s** für Pipeline- und Batch-Endpoints
- **Batch-Chunks: 10 Leads** pro Invocation
- **Polling-Intervall: 5s** für Progress-Updates
- **Mockup-Cache** in Supabase Storage (nicht pro Request neu rendern)

### 8.4 Kosten-Kontrolle
- **1 Email pro Lead** statt 5 = 80% weniger Tokens bei Email-Stage
- **Haiku 4.5** für Email-Gen (billig), Opus nur falls komplexe Klassifikation nötig
- **Mockup einmal gerendert, dann gecacht**

### 8.5 Rollback-Sicherheit
- Vor jedem Block: `git log --oneline -10` als Rollback-Referenz
- Jeder Block endet mit einem eigenen Commit
- DB-Migrationen sind additiv (keine DROP COLUMN ohne Absicherung)

---

## 9. Wichtige Datei-Pfade (Referenz)

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── campaigns/[id]/
│   │   │   ├── page.tsx                    (Campaign-Detail)
│   │   │   ├── review/page.tsx             (Swipe Stage 3, bestehend)
│   │   │   ├── triage/page.tsx             (Swipe Stage 1, Block 3)
│   │   │   └── enrichment-review/page.tsx  (Swipe Stage 2, Block 3)
│   │   ├── leads/[id]/page.tsx
│   │   └── analytics/page.tsx              (Block 8)
│   ├── api/
│   │   ├── campaigns/[id]/
│   │   │   ├── batch-pipeline/route.ts
│   │   │   ├── review-leads/route.ts
│   │   │   ├── instantly-sync/route.ts     (Block 6)
│   │   │   └── send/route.ts               (Block 6)
│   │   ├── leads/[id]/
│   │   │   ├── generate-email/route.ts
│   │   │   ├── run-pipeline/route.ts
│   │   │   ├── review-action/route.ts
│   │   │   └── mockup/route.ts             (Block 4)
│   │   ├── webhooks/instantly/route.ts     (Block 6)
│   │   └── analytics/*                     (Block 8)
│   ├── impressum/page.tsx                  (Block 5)
│   ├── datenschutz/page.tsx                (Block 5)
│   └── d/[slug]/page.tsx                   (Download-Seite)
├── components/
│   ├── swipe/                              (Block 3)
│   └── mockup/                             (Block 4)
├── lib/
│   ├── email/
│   │   ├── writer.ts                       (bestehend, anpassen Block 2)
│   │   ├── followup-writer.ts              (Block 7)
│   │   ├── instantly.ts                    (Block 6)
│   │   └── footer.ts                       (Block 5)
│   ├── pipeline/run-single-lead.ts         (bestehend, anpassen Block 2)
│   ├── wallet/{pass-data,google}.ts
│   └── supabase/types.ts
└── middleware.ts
```

---

# BLOCK 1 — DB-Migrationen

## Start-Prompt (bei /clear kopieren)
```
Lies MASTERPLAN.md komplett. Starte Block 1: DB-Migrationen.

Pre-Flight:
1. Verifiziere aktuellen DB-Stand via Supabase MCP (list_tables für leads, campaigns, email_events).
2. Prüfe ob Spalten aus Block 1 bereits existieren (ggf. wurde teilweise migriert).
3. Prüfe src/lib/supabase/types.ts, ob Types schon die neuen Spalten haben.
4. Überlege Querverbindungen: Welche Spalten werden in Block 2-9 gebraucht? Sind Defaults richtig gewählt, damit bestehende Leads nicht kaputt gehen?
5. Falls du Unklarheiten hast oder bessere Lösungen siehst, FRAGE Lano, bevor du migrierst.

Dann: Migration via Supabase MCP apply_migration, types.ts aktualisieren, committen, pushen.
```

## Scope
Alle neuen Spalten und Tabellen für Blöcke 2-9 in einer einzigen Migration, damit wir nicht wiederkommen müssen.

## DB-Änderungen

### `leads` Tabelle — neue Spalten
| Spalte | Typ | Default | Zweck |
|--------|-----|---------|-------|
| `ab_group` | VARCHAR(20) | NULL | Zugewiesene A/B-Strategie |
| `ab_group_override` | BOOLEAN | FALSE | Wurde im Review überschrieben |
| `mockup_png_url` | TEXT | NULL | Gecachter Mockup-URL in Supabase Storage |
| `followup_stage` | INT | 0 | 0=initial, 1=FU1 gesendet, 2=FU2 gesendet |
| `next_followup_at` | TIMESTAMPTZ | NULL | Wann nächstes Follow-up fällig ist (informativ, Instantly handhabt Zeitplan) |
| `last_email_sent_at` | TIMESTAMPTZ | NULL | Letzter Versand-Timestamp |
| `email_initial_subject` | TEXT | NULL | Initial-Email (bereits in email_subject, ggf. konsolidieren) |
| `email_initial_body` | TEXT | NULL | — |
| `email_followup1_subject` | TEXT | NULL | Follow-up 1 vorgeneriert |
| `email_followup1_body` | TEXT | NULL | — |
| `email_followup2_subject` | TEXT | NULL | Follow-up 2 vorgeneriert |
| `email_followup2_body` | TEXT | NULL | — |

> **Claude-Hinweis:** Prüfe, ob `email_subject` und `email_body` bereits als "Initial" genutzt werden. Falls ja, ist `email_initial_subject/body` redundant → dann nur Follow-up-Felder ergänzen.

### `campaigns` Tabelle — neue Spalten
| Spalte | Typ | Default | Zweck |
|--------|-----|---------|-------|
| `instantly_campaign_id` | TEXT | NULL | Verknüpfte Instantly-Campaign-ID |
| `is_paused` | BOOLEAN | FALSE | Campaign pausiert? |
| `paused_reason` | TEXT | NULL | Grund der Pause |
| `ab_test_complete` | BOOLEAN | FALSE | Explore-Phase beendet (für zukünftigen Explore+Exploit-Modus) |
| `sending_started_at` | TIMESTAMPTZ | NULL | Wann wurde Versand gestartet |

### Neue Tabelle `email_events`
```sql
CREATE TABLE email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'unsubscribed'
  instantly_event_id TEXT,  -- für Deduplication
  metadata JSONB,           -- Instantly-Payload
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_events_lead ON email_events(lead_id);
CREATE INDEX idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);
CREATE INDEX idx_email_events_occurred ON email_events(occurred_at DESC);
CREATE UNIQUE INDEX idx_email_events_dedup ON email_events(instantly_event_id) WHERE instantly_event_id IS NOT NULL;
```

### Indizes für Performance
```sql
CREATE INDEX idx_leads_ab_group ON leads(ab_group) WHERE ab_group IS NOT NULL;
CREATE INDEX idx_leads_campaign_score ON leads(campaign_id, lead_score DESC);
CREATE INDEX idx_leads_followup ON leads(next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX idx_campaigns_paused ON campaigns(is_paused) WHERE is_paused = TRUE;
```

## TypeScript-Updates
- `src/lib/supabase/types.ts` um alle neuen Felder ergänzen
- Generate-Types via `mcp__claude_ai_Supabase__generate_typescript_types`, dann mit bestehender Struktur mergen (nicht stumpf ersetzen, weil wir ggf. Kommentare haben)

## Acceptance Criteria
- [ ] Alle neuen Spalten auf `leads` und `campaigns` existieren
- [ ] Tabelle `email_events` existiert mit Indexes
- [ ] Alle Indexes angelegt
- [ ] `src/lib/supabase/types.ts` synchronisiert
- [ ] Bestehende Endpoints funktionieren weiter (keine Breaking Changes)
- [ ] Commit + Push (`chore: Block 1 — DB migrations for phase 6-9`)

## Querverbindungen (was Claude checken muss)
- Block 2 nutzt `ab_group` und `ab_group_override`
- Block 4 nutzt `mockup_png_url`
- Block 6 nutzt `instantly_campaign_id`, `email_events`, `is_paused`
- Block 7 nutzt `followup_stage`, `next_followup_at`, `email_followup1/2_*`
- Block 8 nutzt `email_events`, `ab_group`, `is_paused`
- Block 9 nutzt `is_paused`

---

# BLOCK 2 — A/B Testing Umstellung

## Start-Prompt (bei /clear kopieren)
```
Lies MASTERPLAN.md komplett. Starte Block 2: A/B Testing Umstellung.

Pre-Flight:
1. Verifiziere Block 1 ist abgeschlossen (Spalten ab_group, ab_group_override existieren).
2. Lies src/lib/pipeline/run-single-lead.ts und src/lib/email/writer.ts komplett.
3. Lies src/app/api/leads/[id]/generate-email/route.ts.
4. Lies src/app/(dashboard)/campaigns/[id]/review/page.tsx, um Review-Flow zu verstehen.
5. Überlege: Was passiert mit bestehenden Leads, die schon 5 Varianten haben? (Rückwärtskompatibilität)
6. Überlege: Wie wird die zufällige Gleichverteilung implementiert? (Counter-basiert pro Campaign vs. echt zufällig) — dokumentiere deine Wahl und die Begründung.
7. Falls Unklarheiten: FRAGE Lano.

Dann: Implementieren, testen, committen, pushen.
```

## Scope
Umstellung der Pipeline von "5 Emails pro Lead" auf "1 Email pro Lead, zufällig zugewiesen". Override im Review bleibt möglich.

## Implementierungs-Details

### Strategie-Zuweisung
Beim Batch-Pipeline-Run wird für jeden neuen Lead eine A/B-Gruppe zugewiesen. **Ansatz: Counter-basierte Gleichverteilung pro Campaign.**

Pseudo-Code:
```typescript
// In run-single-lead.ts, vor Email-Generation:
const strategies = ['curiosity', 'social_proof', 'direct', 'storytelling', 'provocation']
const counts = await supabase
  .from('leads')
  .select('ab_group', { count: 'exact' })
  .eq('campaign_id', campaignId)
  .not('ab_group', 'is', null)
  .group('ab_group')

// Nimm die Strategie mit dem niedrigsten Count
const nextStrategy = strategies.sort((a, b) => (counts[a] || 0) - (counts[b] || 0))[0]
```

**Warum Counter-basiert?** Echte Zufallsverteilung kann bei kleinen Samples (< 50 Leads) ungleiche Gruppen produzieren. Counter-Approach garantiert Gleichverteilung.

### Email-Generation (statt 5 jetzt 1)
In `src/lib/pipeline/run-single-lead.ts`:
- Entfernen: Loop über alle 5 Strategien
- Neu: Generiere nur die Email für `lead.ab_group`
- `email_variants` JSONB behält nur diese eine Strategie (als Objekt mit Key = Strategie-Name)

```typescript
const email = await writeEmail({ ...leadContext, strategy: lead.ab_group })
await supabase.from('leads').update({
  email_subject: email.subject,
  email_body: email.body,
  email_strategy: lead.ab_group,
  email_variants: { [lead.ab_group]: { subject: email.subject, body: email.body } },
}).eq('id', lead.id)
```

### Review-Flow Anpassung
In `src/app/(dashboard)/campaigns/[id]/review/page.tsx` und `src/app/api/leads/[id]/review-action/route.ts`:
- **Default-Tab:** Die zugewiesene Strategie (`lead.ab_group`)
- **Andere Strategie-Tabs** werden grau/inaktiv angezeigt, mit Button "Strategie wechseln — neu generieren"
- **Klick auf "Strategie wechseln":** Ruft `/api/leads/[id]/generate-email?strategy=X&persist=true` auf, der die neue Variante in `email_variants` hinzufügt, `email_subject/body/strategy` aktualisiert und `ab_group_override = true` setzt

### Bestehende Leads (Rückwärtskompatibilität)
Leads aus alten Campaigns (vor Block 2) haben 5 Varianten in `email_variants`. Das ist OK — sie bleiben unverändert. Neue Leads haben nur 1 Variante. Kein Backfill nötig.

## Dateien

| Datei | Änderung |
|-------|----------|
| `src/lib/pipeline/run-single-lead.ts` | A/B-Zuweisung + nur 1 Email generieren |
| `src/app/api/leads/[id]/generate-email/route.ts` | Override-Flag setzen bei persist |
| `src/app/(dashboard)/campaigns/[id]/review/page.tsx` | UI: Default auf ab_group, Wechsel-Button |
| `src/app/api/leads/[id]/review-action/route.ts` | `ab_group_override` tracken |

## Acceptance Criteria
- [ ] Neue Leads bekommen `ab_group` zugewiesen, gleichverteilt pro Campaign
- [ ] Nur 1 Email wird pro Lead generiert (Token-Check: ca. 80% weniger Email-Tokens)
- [ ] Review-UI zeigt standardmäßig `ab_group`-Variante
- [ ] Strategie-Wechsel funktioniert, setzt `ab_group_override = true`
- [ ] Bestehende Leads (mit 5 Varianten) funktionieren weiter
- [ ] Log-Statement: `[Pipeline] Assigned ab_group: X for lead Y (campaign counts: ...)`
- [ ] Commit + Push (`feat: Block 2 — A/B testing, 1 email per lead`)

## Querverbindungen
- Blockiert Block 3 nicht (Swipe-Infrastruktur ist UI-seitig unabhängig)
- Block 7 nutzt `ab_group` für Follow-up-Eskalation
- Block 8 analysiert nach `ab_group`

---

# BLOCK 3 — Swipe-Infrastruktur

## Start-Prompt (bei /clear kopieren)
```
Lies MASTERPLAN.md komplett. Starte Block 3: Swipe-Infrastruktur.

Pre-Flight:
1. Verifiziere Block 1 + 2 abgeschlossen.
2. Lies src/app/(dashboard)/campaigns/[id]/review/page.tsx komplett (Stage 3 existiert schon, Template für Stage 1 und 2).
3. Lies src/app/api/campaigns/[id]/review-leads/route.ts und src/app/api/leads/[id]/review-action/route.ts.
4. Prüfe welche Daten auf Leads verfügbar sind (types.ts) — was fehlt für Stage 1 und 2?
5. Überlege: Universal Component vs. 3 separate Pages? Was ist wartbarer?
6. Überlege: Wie werden inline Edits (Logo, Farbe, Reward) persistiert? Debounced? Auto-save?
7. Überlege Keyboard-Shortcut-Konflikte (insb. bei Color-Pickern).
8. FRAGE Lano bei Designunklarheiten, bevor du baust.

Dann: Implementieren, testen (Lano testet in Browser), committen, pushen.
```

## Scope
Drei Swipe-Screens für die drei Workflow-Stages, mit Inline-Edit-Möglichkeiten.

### Stage 1: `/campaigns/[id]/triage`
**Zweck:** Nach Scraping, vor Enrichment. Schnell Unpassende rauswerfen, Token-Kosten sparen.

**UI-Layout (pro Lead):**
- Linke Hälfte: Business-Karte (Name groß, Kategorie, Rating mit Sternen, Reviews-Count, Adresse, Stadt, Telefon klickbar, Insta-Handle klickbar, Öffnungszeiten, Website-Favicon + Link)
- Rechte Hälfte: Google-Maps-Embed (iframe) + Website-Screenshot (falls verfügbar)
- Unten: Progress-Bar, Stats, Aktions-Buttons

**Edit inline:**
- Name korrigieren
- Website-URL korrigieren (falls GMaps-Scrape falsch war)

**Aktionen:** Approve (→ wird von Batch-Pipeline enriched) / Reject (blacklist) / Skip

**API:**
- `GET /api/campaigns/[id]/triage-leads` — Leads mit `enrichment_status IS NULL`, sortiert `lead_score DESC`
- `POST /api/leads/[id]/triage-action` — approve/reject/skip, optional name/website update

### Stage 2: `/campaigns/[id]/enrichment-review`
**Zweck:** Nach Enrichment, vor Pass+Email-Generation. Qualitätscheck der AI-Daten, inline fixen.

**UI-Layout (pro Lead):**
- Linke Spalte (1/3): Business-Info (Name, Stadt, Branche AI-klassifiziert), **Logo groß** (editierbar), **3 Color-Picker** (BG, Label, Text) mit Live-Preview
- Mittlere Spalte (1/3): AI-Klassifikation
  - Reward/Geschenk-Vorschlag (Text-Input, editierbar)
  - Branche (Dropdown, editierbar)
  - Hook-Points (Liste, editierbar)
  - Impressum-Daten (Name, Email, Adresse — editierbar)
- Rechte Spalte (1/3): Pass-Preview (live gerendert mit aktuellen Farben/Logo)

**Edit inline (Auto-save nach 1s Debounce):**
- Logo: URL eingeben oder Datei-Upload (Drag & Drop Zone)
- Farben: 3 Color-Picker mit Hex-Input
- Geschenk: Text-Input
- Branche: Dropdown
- Kontakt-Email: Text-Input

**Aktionen:** 
- Approve (→ geht in Pass+Email-Generation-Queue)
- Reject (blacklist)
- Skip
- Re-enrich (Enrichment nochmal laufen lassen, falls Daten sehr schlecht)

**API:**
- `GET /api/campaigns/[id]/enrichment-review-leads` — Leads mit `enrichment_status='ready'` und kein Pass/Email yet
- `POST /api/leads/[id]/enrichment-review-action` — approve/reject/skip/reenrich + optionale Updates
- `PATCH /api/leads/[id]/inline-update` — debounced inline-save von einzelnen Feldern

### Stage 3: `/campaigns/[id]/review` (bestehend, erweitern)
**Zweck:** Final Approval vor Versand. Pass + Email + Mockup final prüfen.

**Erweiterungen zu bestehender Implementierung:**
- Zeige Mockup-PNG (Block 4 liefert das)
- Inline-Edit für Subject + Body (contenteditable oder Textarea-Toggle)
- Reward ändern → regeneriert Pass + Email automatisch (mit Ladeindikator)
- Farben-Change wirkt auch auf Mockup-Vorschau (via Live-Render)

### Universal Swipe Component
Neue Komponente `src/components/swipe/SwipeBoard.tsx`:
- Props: `leads`, `renderCard(lead) => ReactNode`, `onAction(leadId, action, data)`
- Features: Keyboard-Shortcuts, Progress-Bar, Stats, Undo, Prefetch
- Jede Stage übergibt ihre eigene `renderCard`-Funktion

## Acceptance Criteria
- [ ] `/campaigns/[id]/triage` funktioniert, zeigt korrekte Daten, Aktionen persistieren
- [ ] `/campaigns/[id]/enrichment-review` funktioniert, inline-Edit speichert debounced
- [ ] Stage 3 Review zeigt Mockup (nach Block 4 integriert), Inline-Edit für Subject/Body
- [ ] Alle 3 Screens sortieren nach `lead_score DESC`
- [ ] Keyboard-Shortcuts funktionieren (Enter/Esc/Pfeile/1-5)
- [ ] Campaign-Detail-Page zeigt Links zu allen 3 Swipe-Modes mit Lead-Counts ("X Leads zu triagen")
- [ ] Lano testet jeden Screen in Browser
- [ ] Commit + Push (`feat: Block 3 — swipe stages triage + enrichment-review + enhanced final`)

## Querverbindungen
- Stage 2 Approve triggert Pass+Email-Generation (Block 2 Pipeline)
- Stage 3 zeigt Mockup aus Block 4
- Stage 3 Approve setzt Lead auf `queued`, von wo Block 6 den Versand startet

---

# BLOCK 4 — Mockup-Generator (Apple Wallet UI)

## Start-Prompt (bei /clear kopieren)
```
Lies MASTERPLAN.md komplett. Starte Block 4: Mockup-Generator.

Pre-Flight:
1. FRAGE Lano ZUERST nach den 4 Apple Wallet Screenshots (Lock Screen Notification, App-Vollansicht, Pass-Liste, Pass-Back).
2. Starte NICHT ohne Screenshots — das Design muss perfekt sein.
3. Recherchiere: Satori vs. @vercel/og vs. Puppeteer für Serverless — was ist 2026 der Standard?
4. Prüfe: Welche Lead-Felder brauchen wir? (business_name, logo_url, pass_bg_color, pass_label_color, pass_text_color, reward, tagline, download_page_slug)
5. Überlege: PNG-Dimensionen? (iPhone 15 Pro = 1179x2556, für Email 600x800 runterskaliert)
6. Überlege Cache-Strategie: wann invalidiert (Farben-Change, Logo-Change, Reward-Change)?
7. Überlege Deliverability: PNG <150 KB, 1 Bild pro Email.
8. Präsentiere Lano 2-3 Design-Varianten als Preview bevor du final committest.

Dann: Implementieren, iterieren bis Lano "perfekt" sagt, committen, pushen.
```

## Scope
Renderer für Apple-Wallet-UI-Mockup als PNG, das als Inline-Bild in Emails verwendet wird.

## Implementierungs-Details

### Stack-Entscheidung
**Recommendation (vorläufig):** `@vercel/og` (Satori-basiert) für Serverless-PNG-Rendering. Vorteile: läuft auf Vercel Edge, < 50 KB Library, unterstützt Tailwind-ähnliches Styling, Custom Fonts.

**Fallback:** Puppeteer im Node-Runtime, falls Satori nicht genug Kontrolle über iOS-spezifisches Rendering bietet.

### Design (muss mit Lano abgestimmt werden)
Apple Wallet App zeigt einen Pass meistens so:
- iPhone-Frame außen (optional, macht es "produktnäher")
- Pass-Card im Vordergrund mit: Logo oben links, Organization-Name, Reward-Text zentriert, QR-Code unten, Background-Farbe, Label-Farbe, Text-Farbe
- Ggf. Hintergrund angedeutet (Lock Screen dunkel, oder App-Wallet-Gradient)

Screenshots von Lano bekommen wir, dann bauen wir die React-Component 1:1 nach.

### Datei-Struktur
```
src/components/mockup/
├── AppleWalletMockup.tsx       # React-Component für Rendering
├── IPhoneFrame.tsx             # optional, Rahmen
└── types.ts
```

### API-Endpoint
`src/app/api/leads/[id]/mockup/route.ts`:
- GET → rendert Mockup für Lead, cached in Supabase Storage unter `mockups/{lead-id}.png`
- Query `?force=1` → invalidiert Cache
- Rückgabe: PNG-Stream (für direkten Download) oder JSON mit Storage-URL

### Cache-Strategie
- `mockup_png_url` Spalte auf Lead (aus Block 1)
- Invalidierung: Pipeline-Run setzt URL = NULL, wenn Pass-Farben/Logo/Reward geändert wurden
- Beim Email-Send: Wenn `mockup_png_url` NULL → generieren, speichern, verlinken

### Email-Integration (Vorbereitung für Block 6)
- In der Email als `<img src="{{mockup_url}}" alt="{{business_name}} Treuekarte">` eingebunden
- Instantly Custom Variable: `mockup_url` = Supabase-Storage-Public-URL
- Bildgröße: 600x800 @ 72dpi, JPEG Quality 82 → ~100 KB

### Deliverability-Regeln
- **PNG < 150 KB** (komprimieren via sharp)
- **Alt-Text** immer gesetzt (`{{business_name}} Treuekarte Vorschau`)
- **HTTPS-URL** (Supabase Storage Public URL)
- **Keine externen Fonts** im Rendering (embedded fonts in Satori)

## Acceptance Criteria
- [ ] Mockup sieht nach Lanos Urteil "perfekt" aus
- [ ] `GET /api/leads/[id]/mockup` liefert PNG
- [ ] PNG ist < 150 KB
- [ ] Cache funktioniert (zweiter Aufruf < 500 ms)
- [ ] Cache wird bei Farben-/Logo-/Reward-Change invalidiert
- [ ] Stage 3 Review zeigt Mockup
- [ ] Commit + Push (`feat: Block 4 — Apple Wallet UI mockup generator`)

## User-Inputs benötigt (VORHER)
1. **4 Apple Wallet Screenshots** von Lano
2. Feedback zu 2-3 Design-Varianten bevor Final

## Querverbindungen
- Block 3 Stage 3 zeigt das Mockup im Review
- Block 6 Email-Send hängt Mockup-URL als Custom Variable an

---

# BLOCK 5 — Impressum, Datenschutz & Email-Footer

## Start-Prompt (bei /clear kopieren)
```
Lies MASTERPLAN.md komplett. Starte Block 5: Impressum & Footer.

Pre-Flight:
1. FRAGE Lano ZUERST nach den vollständigen LLC-Daten (siehe User-Inputs unten). Starte NICHT ohne.
2. Lies src/middleware.ts — die Impressum-Seite muss auf deine-treuekarte.de erreichbar sein.
3. Recherchiere §5 TMG Anforderungen 2026 (gab es Änderungen?).
4. Überlege: Datenschutz-Erklärung — müssen wir Instantly, Supabase, Vercel, Anthropic alle auflisten?
5. Prüfe bestehende Email-Generator (writer.ts) — wo wird Footer aktuell eingefügt?
6. Überlege wie Footer in HTML vs. Plain-Text Varianten aussieht.
7. Bei rechtlichen Unklarheiten: FRAGE Lano (er soll ggf. mit Rechtsanwalt prüfen).

Dann: Implementieren, committen, pushen. Lano muss Impressum-Seite in Browser verifizieren.
```

## Scope
1. Impressum-Seite auf `deine-treuekarte.de/impressum` (gemäß §5 TMG)
2. Datenschutz-Seite auf `deine-treuekarte.de/datenschutz` (gemäß DSGVO)
3. Email-Footer-Template mit minimaler Info + Links

## User-Inputs benötigt (VORHER)
Lano muss liefern:
- **Offizieller Firmenname** (z.B. "Erfolgssinn GmbH", "Erfolgssinn UG (haftungsbeschränkt)", "Erfolgssinn GbR")
- **Vollständige Geschäftsadresse** (Straße, Hausnummer, PLZ, Stadt)
- **Vertretungsberechtigte** (Geschäftsführer — Lano Aziz?)
- **Handelsregister-Nummer** + **Registergericht** (falls GmbH/UG)
- **USt-ID** (falls umsatzsteuerpflichtig, beginnt mit DE...)
- **Wirtschafts-ID** (falls vorhanden, neu seit 2024)
- **Kontakt-Email für rechtliche Anfragen** (z.B. impressum@deine-treuekarte.de oder Lanos persönliche)
- **Telefonnummer** für Impressum (optional aber empfohlen)

Für Datenschutz zusätzlich:
- Cookie-Nutzung auf Download-Seite? (aktuell vermutlich keine)
- Analytics auf Download-Seite? (falls ja: welche Tools)
- Kontakt-Email für DSGVO-Anfragen (Auskunft, Löschung)

## Implementierungs-Details

### Impressum-Seite (`src/app/impressum/page.tsx`)
Statische Seite, erreichbar unter `https://deine-treuekarte.de/impressum` (NICHT auf autrich.vercel.app — Middleware muss diese Route auf Download-Domain erlauben, ggf. auch).

Inhalt gemäß §5 TMG:
- Firma, Adresse, Vertretungsberechtigte
- Handelsregister + HRB-Nummer + Registergericht
- USt-ID
- Kontakt (Email, Telefon)
- Berufshaftpflicht (falls regulierter Beruf — hier nein)
- Streitschlichtung-Hinweis (EU-Verordnung)

### Datenschutz-Seite (`src/app/datenschutz/page.tsx`)
Inhalt:
- Verantwortlicher (Firma + Kontakt)
- Datenarten (Lead-Daten aus GMaps, Email-Interaktionen)
- Zwecke (Cold-Email-Outreach für Treuekarten-Demo)
- Rechtsgrundlage (Art. 6 DSGVO — berechtigtes Interesse, mit Opt-out)
- Empfänger (Instantly, Supabase, Vercel, Anthropic — alle gehostet in USA/EU? Welche Verträge?)
- Speicherdauer
- Betroffenenrechte (Auskunft, Berichtigung, Löschung, Widerspruch)
- Kontakt für DSGVO-Anfragen

**WICHTIG:** Claude soll Lano explizit darauf hinweisen, dass der Datenschutz-Text von einem Anwalt oder mit einem Generator (e-recht24.de, activeMind) erstellt werden sollte. Wir liefern einen Template, Lano ist für Korrektheit verantwortlich.

### Middleware-Anpassung
`src/middleware.ts` muss `/impressum` und `/datenschutz` auf `deine-treuekarte.de` erlauben (zusätzlich zu `/d/*` etc.).

### Email-Footer (`src/lib/email/footer.ts`)

**HTML-Version (für Email-Body):**
```html
<hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">
<div style="font-size: 12px; color: #666; line-height: 1.5;">
  Lano Aziz · [LLC-NAME] · [STADT]<br>
  <a href="https://deine-treuekarte.de/impressum" style="color: #666;">Impressum</a> · 
  <a href="https://deine-treuekarte.de/datenschutz" style="color: #666;">Datenschutz</a> · 
  <a href="{{unsubscribe_link}}" style="color: #666;">Abmelden</a>
</div>
```

**Plain-Text-Version:**
```
--
Lano Aziz · [LLC-NAME] · [STADT]
Impressum: https://deine-treuekarte.de/impressum
Datenschutz: https://deine-treuekarte.de/datenschutz
Abmelden: {{unsubscribe_link}}
```

Der Footer wird vom Email-Writer (`writer.ts`) angehängt UND kann per Instantly Template konfiguriert werden (beides möglich, für Sicherheit beides aktiv).

## Acceptance Criteria
- [ ] `/impressum` auf deine-treuekarte.de erreichbar und vollständig
- [ ] `/datenschutz` auf deine-treuekarte.de erreichbar (Template)
- [ ] Lano hat Texte geprüft und freigegeben
- [ ] `src/lib/email/footer.ts` exportiert HTML + Plain-Text Footer
- [ ] Email-Generator fügt Footer automatisch an
- [ ] Middleware erlaubt `/impressum` und `/datenschutz` auf Download-Domain
- [ ] Links im Footer klickbar und korrekt
- [ ] Commit + Push (`feat: Block 5 — Impressum, Datenschutz, Email-Footer`)

## Querverbindungen
- Block 6 Email-Send setzt `{{unsubscribe_link}}` aus Instantly ein
- Block 6 Lead-Upload hängt Footer an jede Email

---

# BLOCK 6 — Instantly.ai Integration

## Start-Prompt (bei /clear kopieren)
```
Lies MASTERPLAN.md komplett. Starte Block 6: Instantly Integration.

Pre-Flight:
1. Verifiziere Blocks 1-5 abgeschlossen (DB, A/B, Swipe, Mockup, Footer).
2. FRAGE Lano nach Instantly API-Key (als INSTANTLY_API_KEY in Vercel setzen).
3. FRAGE Lano nach Warmup-Status der Sending-Domains — KRITISCH. Ohne Warmup keinen Versand.
4. Lies Instantly API v2 Docs (https://developer.instantly.ai/) — WebSearch falls nötig. Check auf Änderungen seit 2026.
5. Lies src/lib/pipeline/run-single-lead.ts — wie werden Emails generiert?
6. Überlege: Sequence-Setup in Instantly — automatisch via API oder manuell in Instantly-UI?
7. Überlege: Custom Variables für Personalisierung — welche Felder brauchen wir? (subject, body, mockup_url, reward, business_name)
8. Überlege: Error-Recovery — was wenn Instantly-Upload failt? Retry-Logic?
9. Überlege: Rate-Limits — wie viele API-Calls pro Minute erlaubt?
10. FRAGE Lano bei Unklarheiten zu Sending-Strategie.

Dann: Implementieren, mit 1 Test-Lead testen, committen, pushen.
```

## Scope
Komplette Integration von Instantly.ai: Client, Send-Endpoint, Webhook-Handler, Campaign-UI-Controls.

## User-Inputs benötigt (VORHER)
1. **Instantly API-Key** (als `INSTANTLY_API_KEY` in Vercel Env)
2. **Webhook-Secret** (als `INSTANTLY_WEBHOOK_SECRET` in Vercel Env)
3. **Sending-Domains konfiguriert** in Instantly (SPF/DKIM/DMARC gesetzt)
4. **Warmup abgeschlossen** (mindestens 14 Tage pro Domain)
5. **Bestätigung:** Sending-Emails hinterlegt in Instantly-Account

## Implementierungs-Details

### API-Client (`src/lib/email/instantly.ts`)
Funktionen:
- `createCampaign(name, settings)` — Campaign in Instantly erstellen
- `getCampaign(id)` — Campaign-Details abrufen
- `updateCampaign(id, updates)` — z.B. Status ändern
- `pauseCampaign(id)` / `resumeCampaign(id)`
- `deleteCampaign(id)` (vorsichtig einsetzen)
- `addLeadsToCampaign(campaignId, leads[])` — Batch-Upload mit Custom Variables
- `getLeadStatus(leadId)` — einzelner Lead-Status
- `listLeads(campaignId, filters)` — Leads einer Campaign
- `getCampaignAnalytics(campaignId)` — Stats aus Instantly (Sent, Opened, etc.)

### Authentifizierung
Bearer-Token: `Authorization: Bearer {{INSTANTLY_API_KEY}}`
Base-URL: `https://api.instantly.ai/api/v2`

### Sequence-Setup
Sequence mit 3 Steps in Instantly:
- **Step 1 (Initial):** Subject: `{{email_initial_subject}}`, Body: `{{email_initial_body}}{{footer}}`, Send: immediately
- **Step 2 (Follow-up 1):** Subject: `{{email_followup1_subject}}`, Body: `{{email_followup1_body}}{{footer}}`, Send: after 3 days, if no reply
- **Step 3 (Follow-up 2):** Subject: `{{email_followup2_subject}}`, Body: `{{email_followup2_body}}{{footer}}`, Send: after 4 more days, if no reply

**Offene Frage an Lano:** Sequence pro Campaign neu erstellen oder wiederverwendbares Template? Empfehlung: neu pro Campaign, damit du Templates unabhängig testen kannst.

### Custom Variables (pro Lead)
```typescript
{
  first_name: lead.contact_first_name || lead.business_name,
  business_name: lead.business_name,
  reward: lead.reward_description,
  download_url: `https://deine-treuekarte.de/d/${lead.download_page_slug}`,
  mockup_url: lead.mockup_png_url,
  email_initial_subject: lead.email_subject,
  email_initial_body: lead.email_body,
  email_followup1_subject: lead.email_followup1_subject,
  email_followup1_body: lead.email_followup1_body,
  email_followup2_subject: lead.email_followup2_subject,
  email_followup2_body: lead.email_followup2_body,
}
```

### Endpoints

**`src/app/api/campaigns/[id]/instantly-sync/route.ts`** (POST)
- Erstellt Instantly-Campaign falls `instantly_campaign_id` NULL
- Speichert ID in DB
- Setzt Sequence auf (3 Steps, 3+7 Tage)
- Response: `{ instantly_campaign_id }`

**`src/app/api/campaigns/[id]/send/route.ts`** (POST)
- Pre-check: `is_paused === false`
- Lädt alle Leads mit `pass_status='ready' AND email_status='approved'` (Review approved)
- Batch-Upload zu Instantly (max 100 pro API-Call, chunked)
- Markiert Leads als `email_status='sending'` + `last_email_sent_at=NOW()`
- `maxDuration = 300`, Chunk-Polling wie Batch-Pipeline

**`src/app/api/webhooks/instantly/route.ts`** (POST)
- Validiert Webhook-Signature (`INSTANTLY_WEBHOOK_SECRET`)
- Parsed Event-Type: `email_sent`, `email_opened`, `email_clicked`, `email_replied`, `email_bounced`, `email_unsubscribed`
- Dedup via `instantly_event_id`
- Insert in `email_events` Tabelle
- Update `leads`:
  - `email_opened` → `email_opened_at`
  - `email_clicked` → `email_clicked_at`
  - `email_replied` → `email_replied_at` + `email_status='replied'`
  - `email_bounced` → `email_status='bounced'` + blacklist
  - `email_unsubscribed` → `email_status='unsubscribed'` + blacklist

### Campaign-UI Erweiterung (`src/app/(dashboard)/campaigns/[id]/page.tsx`)
Neue Sektion "Versand" auf der Campaign-Detail-Page:
- Wenn `instantly_campaign_id` NULL: Button "In Instantly erstellen"
- Wenn vorhanden: Status-Box
  - Leads approved: X
  - Leads sending: Y
  - Leads sent: Z
  - Live-Stats von Instantly (Sent, Opened, Clicked, Replied)
  - Buttons: "Approved Leads senden" (mit Confirmation), "Pause" / "Resume"
- Link zu Instantly-Campaign-Dashboard

### Error-Handling
- 429 Rate Limit → exponential backoff, max 3 retries
- 5xx Server Error → retry once, dann failen + loggen
- 4xx Client Error → kein Retry, loggen + in UI anzeigen

## Acceptance Criteria
- [ ] API-Client vollständig implementiert mit allen Funktionen
- [ ] `instantly-sync` erstellt Campaign + Sequence in Instantly
- [ ] `send` lädt Leads hoch, setzt Status auf `sending`
- [ ] Webhook-Handler empfängt und verarbeitet alle Event-Typen
- [ ] Webhook-Signature validiert
- [ ] Campaign-UI zeigt Live-Stats und Send-Controls
- [ ] 1 Test-Lead wurde erfolgreich durch den kompletten Flow geschickt (ohne echte Email, in Instantly-Test-Mode oder mit Lanos eigener Email)
- [ ] Commit + Push (`feat: Block 6 — Instantly integration (client, send, webhooks)`)

## Querverbindungen
- Block 7 Follow-up-Generation geschieht **vor** Instantly-Upload (Block 6 lädt alle 3 Emails gleichzeitig hoch)
- Block 8 liest aus `email_events` Tabelle
- Block 9 Pause ruft `pauseCampaign(instantly_campaign_id)` auf

---

# BLOCK 7 — Follow-ups (2 Stufen, Eskalation)

## Start-Prompt (bei /clear kopieren)
```
Lies MASTERPLAN.md komplett. Starte Block 7: Follow-ups.

Pre-Flight:
1. Verifiziere Block 6 abgeschlossen (Instantly integriert).
2. Lies src/lib/email/writer.ts — verstehe die 5 Strategien.
3. Überlege: Follow-up 1 = gleiche Strategie (soft reminder), Follow-up 2 = "direct" (letzte Chance) — wie unterscheiden sich Tonalität und CTA?
4. Überlege: Sollen Follow-ups auf Initial referenzieren ("wie letzte Woche erwähnt...") oder standalone?
5. Überlege: Was passiert mit Leads, die schon im alten Flow waren? Können sie nachträglich Follow-ups bekommen?
6. Prüfe Instantly-Sequence-Logik: Stoppt die Sequence automatisch bei Reply/Bounce/Unsubscribe? (Ja laut Docs, verifizieren.)
7. FRAGE Lano bei Tonalitäts-Unklarheiten.

Dann: Implementieren, 3 Test-Emails durchlaufen lassen (Test-Lead mit Lanos Email), committen, pushen.
```

## Scope
Vorgenerieren der beiden Follow-up-Emails pro Lead (zusätzlich zur Initial). Instantly kümmert sich um Timing und Stop-Conditions.

## Implementierungs-Details

### Follow-up-Writer (`src/lib/email/followup-writer.ts`)

Neuer Generator, der auf der Initial-Email aufbaut:

```typescript
export async function writeFollowups(input: {
  lead: LeadContext,
  initial_email: { subject: string, body: string },
  ab_group: Strategy,
}): Promise<{
  followup1: { subject: string, body: string },
  followup2: { subject: string, body: string },
}>
```

**Follow-up 1 (Tag +3):**
- Strategie: Gleiche wie Initial (`ab_group`)
- Tonalität: "soft reminder", referenziert die erste Email ("habe ich dir letzte Woche geschrieben..."), bietet kurze Zusammenfassung, eine Frage als CTA
- Länge: ca. 50% der Initial-Länge

**Follow-up 2 (Tag +7):**
- Strategie: Immer `direct`, egal welche ab_group die Initial hatte
- Tonalität: "letzte Chance", fragt direkt "Passt das für euch? Ja oder Nein reicht mir." 
- Länge: sehr kurz, 3-4 Sätze
- CTA: Binäre Antwort

### Integration in Pipeline
In `src/lib/pipeline/run-single-lead.ts`:
- Nach Initial-Email-Generation → Follow-up-Writer aufrufen
- Speichern in `email_followup1_subject/body` und `email_followup2_subject/body`

### Stop-Conditions
Instantly-Sequence handhabt automatisch:
- Reply → Stop
- Bounce → Stop
- Unsubscribe → Stop

**Custom Logic nötig?** Nein — Instantly macht das alles. Wir tracken nur via Webhooks was passiert.

### Email-Regeln (aus Memory)
- Keine Dashes (— oder –)
- Du/Sie: Wenn Vorname bekannt → du, wenn nur Nachname → Sie
- Menschlich klingen
- Unterschrift: Lano

## Acceptance Criteria
- [ ] `writeFollowups()` generiert beide Follow-ups auf einem API-Call
- [ ] Pipeline speichert alle 3 Emails pro Lead
- [ ] Instantly-Upload überträgt alle 3 Emails als Sequence-Steps
- [ ] Test-Flow: Lano kriegt 3 Emails in 10 Tagen (oder gekürzt im Test)
- [ ] Stop-Condition verifiziert (manueller Reply → keine Follow-ups mehr)
- [ ] Commit + Push (`feat: Block 7 — 2-step follow-ups with escalation`)

## Querverbindungen
- Block 6 lädt Follow-ups als Sequence-Steps hoch
- Block 8 analysiert Follow-up-Performance (Open/Reply-Rate pro Stage)

---

# BLOCK 8 — Analytics Dashboard

## Start-Prompt (bei /clear kopieren)
```
Lies MASTERPLAN.md komplett. Starte Block 8: Analytics Dashboard.

Pre-Flight:
1. Verifiziere Blocks 1-7 abgeschlossen und es existieren echte email_events.
2. Lies bestehende /analytics Seite (vermutlich Stub).
3. Überlege: Caching-Strategie — Analytics-Queries können teuer werden. Materialized Views? 5-Min-Cache?
4. Überlege: Filter — pro Campaign? Datum-Range? Branche?
5. Überlege: Empty-States — was zeigen, wenn noch keine Daten?
6. Überlege: Export-Funktion — CSV-Download für Lano?
7. FRAGE Lano nach Priorität der Sektionen (was zuerst).

Dann: Implementieren, committen, pushen.
```

## Scope
Komplettes Analytics-Dashboard unter `/analytics` mit 5 Sektionen.

## Implementierungs-Details

### Dashboard-Layout (`src/app/(dashboard)/analytics/page.tsx`)

**Filter-Bar oben:**
- Campaign-Filter (alle oder spezifisch)
- Datum-Range (letzte 7/30/90 Tage, Custom)
- Branche-Filter (optional)

**Sektion 1: Funnel (Hauptansicht)**
Vertikale Bar-Chart:
- Scraped (Leads in DB mit Filter)
- Enriched (`enrichment_status='ready'`)
- Approved (`email_status='approved'`)
- Sent (email_events mit type='sent')
- Opened (unique leads mit event 'opened')
- Clicked (unique leads mit event 'clicked')
- Replied (unique leads mit event 'replied')
- Converted (aktuell: Replied, später manuell markierbar)

Jede Stufe mit Absolut-Zahl und Prozent zur vorherigen Stufe.

**Sektion 2: Strategie-Vergleich**
Tabelle, pro Strategie (nur Leads ohne `ab_group_override`):
| Strategie | Sent | Open-Rate | Click-Rate | Reply-Rate |

Plus Chart: Reply-Rate pro Strategie als Bar-Chart.

**Sektion 3: Branchen-Vergleich**
Tabelle, pro Branche:
| Branche | Sent | Reply-Rate |

Sortiert nach Reply-Rate DESC, zeigt nur Branchen mit > 10 Leads (statistische Signifikanz).

**Sektion 4: Zeit-Analyse**
Heatmap: Wochentag (y) × Stunde (x), Farbe = Open-Rate.

**Sektion 5: Campaign-Vergleich**
Tabelle aller Campaigns:
| Campaign | Start | Leads | Sent | Reply-Rate | Status |

### API-Endpoints
- `GET /api/analytics/funnel?campaign_id=&from=&to=` — Funnel-Daten
- `GET /api/analytics/strategies?campaign_id=&from=&to=` — Strategie-Stats
- `GET /api/analytics/industries?from=&to=` — Branchen-Stats
- `GET /api/analytics/timing?from=&to=` — Heatmap
- `GET /api/analytics/campaigns` — Campaign-Liste mit Stats

### Performance-Optimierung
- **Cache:** 5-Min Server-Cache via `unstable_cache` oder Redis
- **Queries:** Aggregations-SQL direkt in Postgres (nicht Client-seitig)
- **Indexes:** Bereits in Block 1 angelegt (`idx_email_events_*`)

### Libraries
- **Charts:** Recharts (leichtgewichtig, React-native)
- **Heatmap:** Custom SVG oder Visx
- **Export:** Simple CSV-Download via Blob

## Acceptance Criteria
- [ ] `/analytics` zeigt alle 5 Sektionen
- [ ] Filter funktionieren
- [ ] Queries unter 1s für 10k Leads
- [ ] Leere States sinnvoll
- [ ] CSV-Export für jede Sektion
- [ ] Commit + Push (`feat: Block 8 — analytics dashboard`)

## Querverbindungen
- Basis: `email_events` Tabelle aus Block 1
- Liefert Grundlage für Explore+Exploit-Entscheidung (wenn Reply-Rate pro Strategie signifikant abweicht, kann manuell auf Winner gestellt werden)

---

# BLOCK 9 — Extras (Pause, Priorisierung, Duplikate)

## Start-Prompt (bei /clear kopieren)
```
Lies MASTERPLAN.md komplett. Starte Block 9: Extras.

Pre-Flight:
1. Verifiziere Block 6 (Instantly) für Pause-Funktionalität.
2. Prüfe welche Listen/Screens nach lead_score DESC sortiert werden müssen (Campaign-Page, Lead-Liste, Swipes).
3. Prüfe Blacklist-Check beim Import (sollte schon da sein).
4. FRAGE Lano, ob weitere Extras gewünscht sind, die nicht im Plan stehen.

Dann: Implementieren, committen, pushen.
```

## Scope
Kleine Features, die den Flow verbessern:
1. Campaign-Pause-Funktion
2. Lead-Priorisierung nach `lead_score` in allen Listen
3. Duplikate-Warnung über Campaigns hinweg (erweitert)

## Implementierungs-Details

### 9.1 Campaign-Pause
- Button auf `/campaigns/[id]`: "Campaign pausieren" / "Fortsetzen"
- Setzt `is_paused = true/false` + `paused_reason` (optional Textfeld)
- Ruft Instantly `pauseCampaign()` / `resumeCampaign()` auf
- Batch-Pipeline-Endpoint checked `is_paused` vor jedem Chunk und stoppt
- Send-Endpoint checked `is_paused` vor Upload
- UI-Badge "Pausiert" auf Campaign-Karte und Detail-Page

### 9.2 Lead-Priorisierung
Alle Queries mit `ORDER BY lead_score DESC NULLS LAST`:
- `/leads` (Lead-Liste)
- `/campaigns/[id]` (Lead-Tabelle)
- `/campaigns/[id]/triage`
- `/campaigns/[id]/enrichment-review`
- `/campaigns/[id]/review`

Optional: Filter "Nur Score ≥ 70" etc.

### 9.3 Duplikate-Warnung
Beim Campaign-Import:
- Check: Ist dieser Lead schon in einer anderen aktiven Campaign?
- Falls ja: Warning im UI, nicht blockierend ("Dieser Lead ist bereits in Campaign X. Trotzdem importieren?")

## Acceptance Criteria
- [ ] Pause-Button funktioniert, Batch/Send stoppen
- [ ] Instantly-Campaign wird mit pausiert/resumed
- [ ] Alle Listen sortieren nach Score
- [ ] Duplikate-Warnung beim Import
- [ ] Commit + Push (`feat: Block 9 — pause, prioritization, dedup-warnings`)

---

# Anhang

## A. Wichtige Terminal-Commands

```bash
# Dev-Server (nicht nötig für Claude, Lano testet)
npm run dev

# Type-Check (schneller als Build)
npx tsc --noEmit

# Build (NUR wenn explizit gewünscht — Memory-Rule: keine langen Builds)
npm run build

# Git-Log Check
git log --oneline -10

# Supabase-Types regenerieren (via MCP)
# mcp__claude_ai_Supabase__generate_typescript_types
```

## B. Test-Accounts & IDs
- **Supabase Projekt-ID:** `vqwydgtmgrdsbzpipnil`
- **Vercel-Projekt:** `autrich`
- **Apple Wallet Pass-Type-ID:** siehe `.env.local`
- **Google Wallet Issuer-ID:** siehe `.env.local`

## C. Memory-Regeln (aus `~/.claude/projects/.../memory/`)
- **passify-readonly:** Passify-Codebase nie ändern, nur Referenz
- **control-philosophy:** Manuelle Kontrolle, jeder Schritt inspectable, kein Auto-Processing
- **collaboration-style:** Step-by-step, exakte URLs, nach jedem Schritt testen, WHY erklären
- **think-ahead:** Deployment, Error-Handling, Future-Phases VOR dem Bauen bedenken
- **no-long-builds:** Keine wiederholten Build-Checks, implementieren und Lano testen lassen
- **no-brandfetch:** Logos selbst scrapen (Website, Instagram, Favicon, Generated)
- **email-rules:** Keine Dashes (— oder –), du=Vorname, Sie=Nachname, menschlich klingen, Unterschrift "Lano"

## D. Glossar
- **AB-Group:** Eine der 5 Strategien, einem Lead zugewiesen für A/B-Testing
- **ab_group_override:** Im Review manuell gewechselte Strategie, wird aus A/B-Analyse ausgeschlossen
- **Triage:** Swipe Stage 1, nach Scraping, vor Enrichment
- **Enrichment Review:** Swipe Stage 2, nach Enrichment, vor Pass+Email
- **Final Review:** Swipe Stage 3, nach Pass+Email, vor Send
- **Eskalationsstufe:** Follow-up-Tonalität wird schärfer (soft → direct)
- **Warmup:** Instantly-Prozess, Domain langsam auf Volume hochfahren, 14+ Tage

## E. Commit-Message-Style
Beobachtet aus `git log`:
- Kurze Präfixe: `Fix:`, `Add:`, `Update:`, `Remove:`
- Keine AI-Signatur ("🤖 Generated") — Lano committet als "Sternblitz"
- Bei Blöcken aus diesem Plan: `feat: Block X — kurze Beschreibung`

---

## Änderungshistorie dieses Dokuments

| Datum | Änderung | Von |
|-------|----------|-----|
| 2026-04-21 | Initial-Version, 9 Blöcke mit allen Entscheidungen | Claude + Lano |

