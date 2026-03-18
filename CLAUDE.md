# AUTRICH — MASTER PLAN

> All-in-one Cold Email Outreach Tool das über automatisierte, hyperpersonalisierte Emails mit individuell generierten Wallet-Pass-Demos massiv Kunden für Passify/QARD gewinnt. Ziel: 1500 Kunden.

**LIES DIESE DATEI KOMPLETT BEVOR DU IRGENDWAS BAUST ODER ÄNDERST.**

---

## REGELN — IMMER BEFOLGEN

1. **Immer diese CLAUDE.md lesen bevor du eine neue Phase startest**
2. **Nie eine Phase anfangen bevor die vorherige fertig und getestet ist**
3. **Bei Unsicherheit FRAGEN statt raten**
4. **Kein Overengineering — wir bauen Phase für Phase**
5. **Referenz-Code für Pass-Generierung liegt unter ~/Desktop/passify (NUR LESEN, NICHTS ÄNDERN)**
6. **Alle neuen Files kommen ins aktuelle Projekt ~/Desktop/autrich, NIE in passify**
7. **Keine Dateien in passify erstellen, editieren oder löschen — unter keinen Umständen**
8. **TypeScript strict mode — keine `any` Types außer wo unvermeidbar**
9. **Keine unnötigen Abstraktionen — lieber 3 ähnliche Zeilen als ein premature Utility**
10. **Jede Phase hat eine Definition of Done — erst wenn die erfüllt ist, weiter zur nächsten**
11. **Juristisch ist B2B Cold Email abgesichert — keine Bedenken, einfach bauen**
12. **Commits nur wenn der User es explizit verlangt**
13. **JEDE Komponente bekommt einen manuellen Test-Button im Dashboard — keine Batch-only Features**
14. **Services sind IMMER doppelt aufrufbar: einzeln (via Test-UI) UND im Batch (via Pipeline)**

---

## ARCHITEKTUR-PHILOSOPHIE: TEST-FIRST

Jede Komponente im System hat DREI Schichten:

```
┌─────────────────────────────────────────────┐
│ 1. SERVICE (lib/)                           │
│    Pure Funktionen. Kein HTTP, kein DB.      │
│    Input rein → Output raus.                 │
│    Einzeln testbar, wiederverwendbar.        │
├─────────────────────────────────────────────┤
│ 2. API ROUTE (api/)                         │
│    Dünner Wrapper um den Service.            │
│    Validiert Input, ruft Service auf,        │
│    gibt JSON zurück.                         │
│    → Wird vom Dashboard UND vom Batch genutzt│
├─────────────────────────────────────────────┤
│ 3. UI (Dashboard)                           │
│    Test-Formulare in /tools/*               │
│    Action-Buttons auf Lead Detail Pages      │
│    Live-Preview wo möglich                   │
└─────────────────────────────────────────────┘
```

**Beispiel Website Scraper:**
- `lib/enrichment/scraper.ts` → `scrapeWebsite(url)` → gibt Logo, Farben, Meta zurück
- `api/tools/scrape/route.ts` → POST mit `{ url }` → ruft `scrapeWebsite()` → JSON Response
- Dashboard: `/tools/scraper` → URL eingeben → Button "Scrapen" → Ergebnis live sehen
- Batch: Trigger.dev Job ruft denselben `scrapeWebsite()` Service auf

**Das bedeutet:** Wenn der Service funktioniert, funktioniert er überall — im Test-UI, im API-Call, im Batch-Job.

---

## TECH STACK

| Komponente | Technologie | Version | Warum |
|---|---|---|---|
| Framework | Next.js (App Router) | 15.x | Bewährter Stack aus Passify, SSR für Download-Seiten, API Routes |
| Sprache | TypeScript (strict) | 5.x | Type Safety, wie Passify |
| Datenbank | Supabase (neues Projekt) | - | Postgres + Auth + Storage + Realtime für Live-Notifications |
| Job Queue | Trigger.dev v3 | 3.x | Serverless Background Jobs bis 5min, Fan-Out, Retries, Dashboard |
| Hosting | Vercel | - | Bewährter Stack, Trigger.dev löst Timeout-Problem |
| Email Versand | Instantly.ai API | - | Multi-Inbox Rotation, Warmup, Tracking, Bounce Handling, A/B nativ |
| AI Text | Claude Haiku (Anthropic API) | claude-haiku-4-5-20251001 | Emails, Reply Classification, Business Type Detection, Reward Gen |
| AI Images | Google Imagen 4.0 | - | Strip Image Generierung als Fallback (wie Passify) |
| Image Processing | Sharp + node-canvas | - | Strip Images, iPhone Mockup, Logo Processing, Compositing |
| Website Scraping | Cheerio + fetch | - | Lightweight HTML Parsing, kein Puppeteer nötig |
| Apple Pass | passkit-generator | 3.5.x | Wie Passify, bewährt, signiert .pkpass Dateien |
| Google Pass | Google Wallet API + JWT | - | Service Account Auth, Loyalty Objects, wie Passify |
| Excel Parsing | xlsx (SheetJS) | - | CSV/Excel Import, robust, weit verbreitet |
| SMS | Twilio | - | Desktop-to-Mobile Bridge, 0.0075€/SMS |
| Scheduling | Vercel Cron + Trigger.dev | - | Follow-Ups, Dead Lead Recycling, Domain Health |
| Realtime | Supabase Realtime | - | Live-Updates im Dashboard bei Pass-Installation |
| QR Codes | qrcode | - | QR für Desktop Download-Seite |

---

## ARCHITEKTUR-DIAGRAMM

```
┌──────────────────────────────────────────────────────────────────┐
│                       AUTRICH DASHBOARD                          │
│  (Next.js App Router — Vercel)                                   │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │Dashboard │ │Campaigns │ │ Leads    │ │🔧 Tools  │ │Settings│ │
│  │ Funnel   │ │ Batch    │ │ Pipeline │ │ Manuell  │ │ Config │ │
│  │ Activity │ │ Upload   │ │ Detail   │ │ Testen   │ │ Health │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┘ │
│       │             │            │             │                  │
│  ┌────┴─────────────┴────────────┴─────────────┴──────────────┐  │
│  │                    API LAYER                                │  │
│  │                                                             │  │
│  │  /api/campaigns/*     CRUD + Pipeline Dispatch              │  │
│  │  /api/leads/*         CRUD + einzelne Lead Actions          │  │
│  │  /api/passes/*        Pass Download (public)                │  │
│  │  /api/tools/scrape    Manuell: Website scrapen              │  │
│  │  /api/tools/logo      Manuell: Logo verarbeiten            │  │
│  │  /api/tools/classify  Manuell: AI Klassifizierung           │  │
│  │  /api/tools/strip     Manuell: Strip Image generieren       │  │
│  │  /api/tools/pass      Manuell: Pass generieren              │  │
│  │  /api/tools/preview   Manuell: iPhone Mockup generieren     │  │
│  │  /api/tools/email     Manuell: Email schreiben lassen       │  │
│  │  /api/tools/classify-reply  Manuell: Reply klassifizieren   │  │
│  │  /api/tools/download-page   Preview einer Download-Seite    │  │
│  │  /api/webhooks/*      Instantly + Google Wallet              │  │
│  │  /api/v1/*            Apple Wallet Callbacks                 │  │
│  │  /api/analytics/*     Funnel + Dimensionen                  │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                            │                                      │
│  ┌─────────────────────────┴───────────────────────────────────┐  │
│  │              SERVICE LAYER (lib/)                            │  │
│  │  Gleiche Services für Test-UI UND Batch-Pipeline            │  │
│  │                                                             │  │
│  │  enrichment/scraper.ts    → scrapeWebsite(url)              │  │
│  │  enrichment/logo.ts       → processLogo(url)                │  │
│  │  enrichment/colors.ts     → extractColors(imageBuffer)      │  │
│  │  enrichment/instagram.ts  → scrapeInstagram(handle)         │  │
│  │  ai/classifier.ts        → classifyBusiness(data)           │  │
│  │  wallet/strip.ts         → generateStrip(industry, color)   │  │
│  │  wallet/apple.ts         → generateApplePass(data)          │  │
│  │  wallet/google.ts        → generateGooglePass(data)         │  │
│  │  wallet/preview.ts       → generatePreview(passData)        │  │
│  │  email/writer.ts         → writeEmail(lead, strategy)       │  │
│  │  email/classifier.ts     → classifyReply(text)              │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│  ┌─────────────────────────┴───────────────────────────────────┐  │
│  │            TRIGGER.DEV BATCH JOBS                           │  │
│  │  Rufen dieselben Services auf, mit Fan-Out + Retries        │  │
│  │                                                             │  │
│  │  enrich-campaign    → scraper + logo + classify pro Lead    │  │
│  │  generate-passes    → strip + apple + google pro Lead       │  │
│  │  generate-emails    → writer pro Lead                       │  │
│  │  generate-previews  → preview pro Lead                      │  │
│  │  sync-instantly     → bulk upload zu Instantly              │  │
│  │  process-followups  → follow-up logic + email gen           │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │           PUBLIC ROUTES (kein Auth)                          │  │
│  │  /d/[slug]            → Download-Seite (Mobile+Desktop)     │  │
│  │  /api/passes/[serial] → Apple .pkpass Download              │  │
│  │  /api/passes/google   → Google Wallet Redirect              │  │
│  │  /api/v1/devices/*    → Apple Device Registration           │  │
│  │  /api/sms/send        → SMS Link für Desktop                │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## DASHBOARD NAVIGATION

```
AUTRICH
├── Dashboard          → Conversion Funnel, Active Campaigns, Recent Activity
├── Campaigns          → Liste, Erstellen, CSV Upload, Batch starten
│   └── [id]           → Detail, Progress, Leads dieser Kampagne
├── Leads              → Alle Leads, Filter, Pipeline View
│   └── [id]           → Detail mit Timeline + Action Buttons (siehe unten)
├── 🔧 Tools           → Manuelles Testen aller Komponenten
│   ├── Scraper        → URL eingeben → Logo, Farben, Meta, Social Links
│   ├── Logo           → URL/Upload → Verarbeitung sehen (Sizes, BG Removal)
│   ├── AI Classifier  → Business-Daten eingeben → Industry, Reward, Hooks
│   ├── Strip Image    → Industry + Farbe wählen → Template oder AI Preview
│   ├── Pass Generator → Formular ausfüllen → Apple + Google Pass generieren + downloaden
│   ├── Preview        → Pass-Daten eingeben → iPhone Mockup PNG sehen
│   ├── Email Writer   → Lead-Daten + Strategie → generierte Email sehen
│   ├── Reply Classifier → Text einfügen → Kategorie + Confidence sehen
│   └── Download Page  → Slug/Daten eingeben → Live-Preview der Seite
├── Analytics          → Funnel pro Dimension, A/B Tests, Lead Scores
├── Domains            → Sender Domain Health, Warmup Status
└── Settings           → Service Status, Calendly URL, API Keys Check
```

---

## LEAD DETAIL PAGE — ACTION BUTTONS

Jeder Lead hat auf seiner Detail-Seite Buttons für jeden Pipeline-Schritt:

```
┌─────────────────────────────────────────────────────────────┐
│ ← Leads    Döner Palace — Berlin Kreuzberg                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Pipeline: [ENGAGED ▾]     Score: 72     Industry: doener   │
│                                                             │
│  ┌─────── ENRICHMENT ──────┐  ┌─────── TIMELINE ──────────┐│
│  │ Logo: [Bild]            │  │ 03.03 Email sent           ││
│  │ Farbe: ██ #1A1A2E       │  │ 03.03 Email opened         ││
│  │ Industry: doener (AI)   │  │ 03.04 Link clicked         ││
│  │ Reward: 1 Gratis Döner  │  │ 03.04 Pass installed (iOS) ││
│  │ Hooks: 3 Angles         │  │ 03.06 Follow-up sent       ││
│  │                         │  │ 03.07 Reply: "Klingt gut!" ││
│  │ [🔄 Re-Scrape Website]  │  │                            ││
│  │ [🔄 Re-Classify (AI)]   │  └────────────────────────────┘│
│  └─────────────────────────┘                                │
│                                                             │
│  ┌─────── PASS ────────────┐  ┌─────── EMAIL ─────────────┐│
│  │ [iPhone Mockup Preview] │  │ Subject: "Ahmed, ich..."  ││
│  │                         │  │ Strategy: curiosity        ││
│  │ Status: ready           │  │ Variant: A                 ││
│  │ Apple: ✅ generated      │  │                            ││
│  │ Google: ✅ generated     │  │ [📧 Preview Email]         ││
│  │ Strip: template/warm    │  │ [🔄 Re-Generate Email]     ││
│  │ Installed: ✅ iOS        │  │ [📨 Send Test (an mich)]   ││
│  │                         │  │ [🔄 Re-Classify Reply]     ││
│  │ [⬇️ Download .pkpass]    │  └────────────────────────────┘│
│  │ [🔗 Google Save Link]   │                                │
│  │ [🔄 Re-Generate Pass]   │  ┌─────── ACTIONS ───────────┐│
│  │ [🔄 Re-Generate Strip]  │  │ [👁️ Preview Download Page] ││
│  │ [🖼️ Re-Generate Preview]│  │ [📅 Send Calendly Link]    ││
│  └─────────────────────────┘  │ [🚫 Blacklist]             ││
│                               │ [🗑️ Delete Lead]           ││
│  Notes: [________________]    └────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## TOOLS PAGE — ALLE MANUELLEN TESTER

### 🔧 Tool 1: Website Scraper Test

```
┌─────────────────────────────────────────────────────┐
│ 🔧 Website Scraper                                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│ URL: [https://doener-palace.de          ] [Scrapen] │
│                                                     │
│ ─── ERGEBNIS ───────────────────────────────────── │
│                                                     │
│ Logo Kandidaten:                                    │
│ 1. ✅ apple-touch-icon (180x180) ← Best Match      │
│    [Bild Preview]                                   │
│ 2. og:image (1200x630) — zu breit, skip            │
│ 3. favicon.ico (32x32) — zu klein                   │
│                                                     │
│ Dominante Farbe: ██ #8B4513                         │
│ Text Farbe (auto): #FFFFFF                          │
│ Label Farbe (auto): #D4B896                         │
│                                                     │
│ Meta Description: "Türkische Spezialitäten..."      │
│ Title: "Döner Palace Berlin"                        │
│                                                     │
│ Structured Data:                                    │
│   @type: Restaurant                                 │
│   servesCuisine: Turkish                            │
│   openingHours: Mo-Sa 10:00-23:00                   │
│   telephone: 030-12345678                           │
│                                                     │
│ Social Links:                                       │
│   Instagram: @doenerpalace                          │
│   Facebook: /doenerpalaceberlin                     │
│                                                     │
│ Loyalty Detection: ❌ Keine gefunden                │
│ App Detection: ❌ Keine App                         │
│                                                     │
│ Scrape-Dauer: 1.2s                                  │
└─────────────────────────────────────────────────────┘
```

### 🔧 Tool 2: Logo Processor Test

```
┌─────────────────────────────────────────────────────┐
│ 🔧 Logo Processor                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Logo URL: [https://...logo.png] [Verarbeiten]       │
│ ODER: [📎 Upload]                                   │
│                                                     │
│ Hintergrundfarbe für Pass: [#1A1A2E]                │
│                                                     │
│ ─── ERGEBNIS ───────────────────────────────────── │
│                                                     │
│ Original:    [Bild] 400x400 PNG                     │
│ Format:      ✅ PNG                                  │
│ Dimensionen: ✅ 400x400 (gut)                        │
│ Aspect:      ✅ 1:1 (quadratisch)                    │
│ Background:  ⚠️ Weißer Hintergrund erkannt          │
│              → Removed ✅                            │
│                                                     │
│ Generierte Varianten:                               │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌──────┐       │
│ │29px│ │58px│ │87px│ │160 │ │320 │ │256px │       │
│ │icon│ │@2x │ │@3x │ │logo│ │@2x │ │prev. │       │
│ └────┘ └────┘ └────┘ └────┘ └────┘ └──────┘       │
│                                                     │
│ [⬇️ Alle Varianten downloaden (ZIP)]                │
└─────────────────────────────────────────────────────┘
```

### 🔧 Tool 3: AI Business Classifier Test

```
┌─────────────────────────────────────────────────────┐
│ 🔧 AI Business Classifier                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Business Name:  [Döner Palace                     ] │
│ Industry (CSV): [Gastronomie                      ] │
│ City:           [Berlin                           ] │
│ Website Desc:   [Türkische Spezialitäten seit...  ] │
│ Instagram Bio:  [Bester Döner in Kreuzberg 🥙     ] │
│ Has Loyalty:    [ ] Ja                              │
│ Has App:        [ ] Ja                              │
│                                                     │
│                            [🤖 Klassifizieren]       │
│                                                     │
│ ─── AI ERGEBNIS ────────────────────────────────── │
│                                                     │
│ Industry:     doener                                │
│ Reward:       1 Gratis Döner                        │
│ Reward Emoji: 🥙                                    │
│ Stamp Emoji:  🥙                                    │
│ Pass Title:   Treuekarte                            │
│ Max Stamps:   10                                    │
│ Strip Prompt: "Turkish kebab restaurant, warm..."   │
│                                                     │
│ Email Hooks:                                        │
│ 1. "Seit 2010 im Geschäft — digitale..."           │
│ 2. "2.3k Follower — eure Community..."             │
│ 3. "Kreuzberg hat 40+ Dönerläden..."               │
│                                                     │
│ Personalisierung: "Betont Tradition + Community"    │
│                                                     │
│ Tokens: 342 in / 198 out | Cost: $0.0008           │
│ Dauer: 0.8s                                         │
└─────────────────────────────────────────────────────┘
```

### 🔧 Tool 4: Strip Image Generator Test

```
┌─────────────────────────────────────────────────────┐
│ 🔧 Strip Image Generator                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Industry: [▾ doener    ]                            │
│ Farbe:    [#8B4513     ] ██                         │
│ Methode:  (●) Template  ( ) AI Generieren           │
│                                                     │
│                      [🖼️ Generieren]                 │
│                                                     │
│ ─── ERGEBNIS ───────────────────────────────────── │
│                                                     │
│ Match: doener / warm (Template)                     │
│ ┌─────────────────────────────────────────┐         │
│ │                                         │         │
│ │  [Strip Image Preview 1125x432]         │         │
│ │                                         │         │
│ └─────────────────────────────────────────┘         │
│                                                     │
│ Alle Varianten für "doener":                        │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                │
│ │ dark │ │ warm │ │earthy│ │vibr. │                │
│ │      │ │ ✅    │ │      │ │      │                │
│ └──────┘ └──────┘ └──────┘ └──────┘                │
│                                                     │
│ [⬇️ Download PNG]  [🤖 Stattdessen AI generieren]   │
└─────────────────────────────────────────────────────┘
```

### 🔧 Tool 5: Pass Generator Test

```
┌─────────────────────────────────────────────────────┐
│ 🔧 Pass Generator                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ── BUSINESS DATEN ──                                │
│ Name:       [Döner Palace                         ] │
│ Adresse:    [Kottbusser Damm 12, 10999 Berlin     ] │
│ Telefon:    [030-12345678                         ] │
│ Öffnungsz.: [Mo-Sa 10-23, So 11-22               ] │
│                                                     │
│ ── DESIGN ──                                        │
│ Logo:       [📎 Upload] oder [URL eingeben        ] │
│ Hintergrund: [#1A1A2E] ██                           │
│ Strip Image: [▾ Aus Template] oder [📎 Upload]      │
│                                                     │
│ ── PASS INHALTE ──                                  │
│ Titel:       [Treuekarte    ]                       │
│ Stempel:     [🥙] × [3] von [10]                    │
│ Inaktiv:     [⚪]                                    │
│ Prämie:      [1 Gratis Döner 🎉                   ] │
│                                                     │
│ ── LOCATION (optional) ──                           │
│ Latitude:    [52.4934  ]                            │
│ Longitude:   [13.4234  ]                            │
│ Lockscreen:  [Vergiss deinen Stempel nicht! 🥙    ] │
│                                                     │
│ [📱 Apple Pass generieren]  [🤖 Google Pass generieren] │
│                                                     │
│ ─── ERGEBNIS ───────────────────────────────────── │
│                                                     │
│ ┌──────────────┐                                    │
│ │  [iPhone     │  Apple Pass: ✅ Generated           │
│ │   Mockup     │  Serial: abc-123-def               │
│ │   mit dem    │  Size: 47 KB                       │
│ │   generierten│  [⬇️ Download .pkpass]              │
│ │   Pass]      │                                    │
│ │              │  Google Pass: ✅ Generated           │
│ │              │  [🔗 Save URL öffnen]               │
│ └──────────────┘                                    │
│                                                     │
│ [🖼️ iPhone Mockup PNG generieren]                    │
│ [👁️ Download-Seite Preview]                         │
└─────────────────────────────────────────────────────┘
```

### 🔧 Tool 6: Email Writer Test

```
┌─────────────────────────────────────────────────────┐
│ 🔧 Email Writer                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ── LEAD DATEN ──                                    │
│ Name:     [Döner Palace    ] Stadt: [Berlin       ] │
│ Kontakt:  [Ahmed           ] Industry: [doener    ] │
│ Reward:   [1 Gratis Döner  ] Emoji: [🥙           ] │
│ Link:     [https://autrich.de/d/doener-palace     ] │
│                                                     │
│ Hook 1: [Seit 2010 im Geschäft...                 ] │
│ Hook 2: [2.3k Follower...                         ] │
│ Hook 3: [Kreuzberg hat 40+ Dönerläden...          ] │
│ Notes:  [Betont Tradition + Community             ] │
│                                                     │
│ Has Loyalty: [ ]  Has App: [ ]  Instagram: [@doener]│
│                                                     │
│ ── EINSTELLUNGEN ──                                 │
│ Strategie: (●) Curiosity ( ) Social Proof           │
│            ( ) Direct    ( ) Storytelling            │
│            ( ) Provocation                          │
│ Anrede:    (●) Du  ( ) Sie                          │
│ Mit Preview Bild: [✓]                               │
│ Mit PS-Zeile:     [✓]                               │
│                                                     │
│                    [✍️ Email generieren]              │
│                                                     │
│ ─── ERGEBNIS ───────────────────────────────────── │
│                                                     │
│ Subject: "Ahmed, ich hab was für Döner Palace       │
│           gebaut"                                   │
│                                                     │
│ ┌─────────────────────────────────────────┐         │
│ │ Hey Ahmed,                              │         │
│ │                                         │         │
│ │ ich hab mir Döner Palace angeschaut...  │         │
│ │ [kompletter Email-Body]                 │         │
│ │                                         │         │
│ │ Viele Grüße                             │         │
│ │ Lano                                    │         │
│ └─────────────────────────────────────────┘         │
│                                                     │
│ Wörter: 87 | Tokens: 156 in / 112 out              │
│ [📋 Kopieren] [🔄 Nochmal generieren]                │
│ [📨 Test-Email an mich senden]                       │
└─────────────────────────────────────────────────────┘
```

### 🔧 Tool 7: Reply Classifier Test

```
┌─────────────────────────────────────────────────────┐
│ 🔧 Reply Classifier                                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Reply Text:                                         │
│ ┌─────────────────────────────────────────┐         │
│ │ Hallo Lano,                             │         │
│ │                                         │         │
│ │ das sieht echt gut aus! Können wir      │         │
│ │ mal kurz telefonieren?                  │         │
│ │                                         │         │
│ │ Grüße, Ahmed                            │         │
│ └─────────────────────────────────────────┘         │
│                                                     │
│                    [🤖 Klassifizieren]                │
│                                                     │
│ ─── ERGEBNIS ───────────────────────────────────── │
│                                                     │
│ Kategorie:   ✅ interested                           │
│ Confidence:  94%                                    │
│ Auto-Action: → Calendly Link senden                 │
│                                                     │
│ AI Draft Reply:                                     │
│ ┌─────────────────────────────────────────┐         │
│ │ Hey Ahmed,                              │         │
│ │ freut mich! Hier kannst du dir direkt   │         │
│ │ einen Termin buchen: [CALENDLY]         │         │
│ └─────────────────────────────────────────┘         │
│                                                     │
│ [📋 Draft kopieren]                                  │
└─────────────────────────────────────────────────────┘
```

### 🔧 Tool 8: Preview Generator Test

```
┌─────────────────────────────────────────────────────┐
│ 🔧 iPhone Mockup Preview                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ── PASS DATEN (oder Lead ID) ──                     │
│ Lead ID:    [▾ Aus bestehendem Lead wählen   ]      │
│ ODER manuell:                                       │
│ Name:       [Döner Palace       ]                   │
│ Logo URL:   [https://...        ]                   │
│ Farbe:      [#1A1A2E] ██                            │
│ Stamp:      [🥙×3⚪×7            ]                   │
│ Reward:     [1 Gratis Döner 🎉  ]                   │
│ Strip URL:  [https://...        ]                   │
│                                                     │
│                    [🖼️ Preview generieren]            │
│                                                     │
│ ─── ERGEBNIS ───────────────────────────────────── │
│                                                     │
│ ┌──────────────────┐                                │
│ │                  │  Größe: 1200x2400px            │
│ │  [iPhone Mockup  │  Format: PNG                   │
│ │   mit Pass]      │  Size: 312 KB                  │
│ │                  │                                │
│ │                  │  [⬇️ Download PNG]              │
│ │                  │  [📎 Als PDF]                   │
│ └──────────────────┘                                │
└─────────────────────────────────────────────────────┘
```

### 🔧 Tool 9: Download Page Preview

```
┌─────────────────────────────────────────────────────┐
│ 🔧 Download Page Preview                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Lead/Slug: [▾ Aus bestehendem Lead wählen    ]      │
│ ODER manuell:                                       │
│ Name:      [Döner Palace       ]                    │
│ Logo URL:  [https://...        ]                    │
│ Farbe:     [#1A1A2E] ██                             │
│ Preview:   [https://...        ] (iPhone Mockup)    │
│                                                     │
│ Device:    (●) Mobile  ( ) Desktop                  │
│                                                     │
│                    [👁️ Preview laden]                 │
│                                                     │
│ ─── LIVE PREVIEW (iframe) ──────────────────────── │
│ ┌─────────────────────────────────────────┐         │
│ │                                         │         │
│ │     [Live-Rendered Download Page]        │         │
│ │     in einem responsiven Frame          │         │
│ │                                         │         │
│ └─────────────────────────────────────────┘         │
│                                                     │
│ [🔗 URL kopieren]  [↗️ In neuem Tab öffnen]          │
└─────────────────────────────────────────────────────┘
```

---

## DATENBANK-SCHEMA

### Tabelle: `campaigns`

| Feld | Typ | Beschreibung |
|---|---|---|
| id | UUID PK | Auto-generated |
| name | TEXT NOT NULL | "Dönerläden Berlin März 2026" |
| status | TEXT DEFAULT 'draft' | draft, processing, ready, active, paused, completed |
| total_leads | INT DEFAULT 0 | Gesamtanzahl Leads |
| processed_leads | INT DEFAULT 0 | Bereits verarbeitete Leads |
| settings | JSONB DEFAULT '{}' | A/B Test Config, Email Varianten, Timing |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

### Tabelle: `leads`

| Feld | Typ | Beschreibung |
|---|---|---|
| **Identifikation** | | |
| id | UUID PK | Auto-generated |
| campaign_id | UUID FK → campaigns | Zugehörige Kampagne |
| **Import-Daten (aus CSV)** | | |
| business_name | TEXT NOT NULL | Ladenname |
| industry | TEXT | Branche aus CSV |
| website_url | TEXT | Website URL |
| email | TEXT NOT NULL | Kontakt-Email |
| phone | TEXT | Telefonnummer |
| city | TEXT | Stadt |
| address | TEXT | Vollständige Adresse |
| contact_name | TEXT | Inhaber-Name falls bekannt |
| **Enrichment-Daten (auto)** | | |
| enrichment_status | TEXT DEFAULT 'pending' | pending, processing, completed, failed |
| logo_url | TEXT | Extrahiert von Website/Instagram/Fallback |
| logo_source | TEXT | 'website', 'instagram', 'google', 'generated' |
| dominant_color | TEXT | Hex "#1a2b3c" |
| text_color | TEXT | Auto-berechnet für Kontrast |
| label_color | TEXT | Gedämpfte Version von text_color |
| detected_industry | TEXT | AI-erkannt: "doener", "barber", "cafe" |
| detected_reward | TEXT | AI-generiert: "1 Gratis Döner" |
| detected_reward_emoji | TEXT | AI-generiert: "🥙" |
| detected_stamp_emoji | TEXT | AI-generiert: "🥙" |
| detected_pass_title | TEXT | "Treuekarte" / "Stempelkarte" / "Bonuskarte" |
| detected_max_stamps | INT DEFAULT 10 | Stempelanzahl |
| strip_prompt | TEXT | AI-generierter Prompt für Imagen Fallback |
| email_hooks | JSONB DEFAULT '[]' | 3 personalisierte Email-Angles von AI |
| personalization_notes | TEXT | AI-generierte Personalisierungs-Hinweise |
| website_description | TEXT | Meta Description von Website |
| instagram_handle | TEXT | Instagram Username |
| instagram_bio | TEXT | Instagram Bio Text |
| instagram_avatar_url | TEXT | Instagram Profilbild URL |
| instagram_followers | INT | Follower Count |
| google_rating | DECIMAL | Google Places Rating |
| google_reviews_count | INT | Anzahl Google Reviews |
| opening_hours | JSONB | Öffnungszeiten |
| has_existing_loyalty | BOOLEAN DEFAULT false | Hat bereits Stempelkarte/Loyalty |
| has_app | BOOLEAN DEFAULT false | Hat eigene App |
| social_links | JSONB DEFAULT '{}' | { instagram, facebook, tiktok } |
| structured_data | JSONB DEFAULT '{}' | JSON-LD Daten von Website |
| extra_data | JSONB DEFAULT '{}' | Alles Sonstige |
| **Pass-Daten** | | |
| pass_status | TEXT DEFAULT 'pending' | pending, generating, ready, failed |
| apple_pass_url | TEXT | Supabase Storage URL zur .pkpass |
| google_pass_url | TEXT | Google Wallet Save URL |
| download_page_slug | TEXT UNIQUE | "barber-ahmed-berlin" |
| strip_image_url | TEXT | Supabase Storage URL |
| strip_source | TEXT | 'template', 'ai_generated' |
| preview_image_url | TEXT | iPhone Mockup PNG URL |
| pass_serial | TEXT UNIQUE | Für Apple Device Registration |
| pass_auth_token | TEXT | Für Apple webServiceURL Auth |
| pass_installed | BOOLEAN DEFAULT false | Pass auf Gerät installiert |
| pass_installed_at | TIMESTAMPTZ | Wann installiert |
| pass_installed_platform | TEXT | 'apple', 'google' |
| pass_installed_device_id | TEXT | Device Library Identifier |
| **Email-Daten** | | |
| email_status | TEXT DEFAULT 'pending' | pending, review, queued, sent, opened, clicked, replied, bounced |
| email_subject | TEXT | AI-generiert |
| email_body | TEXT | AI-generiert (HTML) |
| email_variant | TEXT | A/B Test Variante: 'A', 'B', 'C', etc. |
| email_strategy | TEXT | 'curiosity', 'social_proof', 'direct', 'storytelling', 'provocation' |
| email_sent_at | TIMESTAMPTZ | |
| email_opened_at | TIMESTAMPTZ | |
| email_clicked_at | TIMESTAMPTZ | |
| email_replied_at | TIMESTAMPTZ | |
| instantly_lead_id | TEXT | ID in Instantly |
| instantly_campaign_id | TEXT | Campaign ID in Instantly |
| **Reply-Daten** | | |
| reply_text | TEXT | Antwort-Text |
| reply_category | TEXT | 'interested', 'not_now', 'not_interested', 'unsubscribe', 'question', 'needs_review' |
| reply_confidence | DECIMAL | AI Confidence Score 0-1 |
| reply_classified_at | TIMESTAMPTZ | |
| reply_draft | TEXT | AI-generierter Antwort-Vorschlag |
| **Follow-Up** | | |
| followup_stage | INT DEFAULT 0 | 0=initial, 1-4=follow-ups |
| followup_branch | TEXT | 'not_opened', 'opened_no_click', 'clicked_no_install', 'installed_no_reply' |
| next_followup_at | TIMESTAMPTZ | |
| **Pipeline** | | |
| pipeline_status | TEXT DEFAULT 'new' | new, contacted, engaged, interested, demo_scheduled, converted, warm, lost, blacklisted |
| lead_score | INT DEFAULT 50 | 0-100 gewichtete Heuristik |
| recycling_count | INT DEFAULT 0 | Anzahl Recycling-Versuche |
| recycling_pool | TEXT | 'cold', 'warm', 'not_now', NULL |
| notes | TEXT | Manuelle Notizen |
| **Timestamps** | | |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

### Weitere Tabellen

**`strip_templates`** — Vorgefertigte Strip Images (60 Templates: 15 Industries × 4 Farben)
**`email_templates`** — AI Prompt-Konfigurationen pro Kampagne/Variante/Strategie
**`tracking_events`** — Granulares Event Log (email_sent, pass_installed, etc.)
**`sender_domains`** — Absender-Domain Health Monitoring
**`device_registrations`** — Apple Wallet Device Callbacks
**`blacklist`** — Geblacklistete Emails (nie wieder kontaktieren)
**`settings`** — Globale Key-Value Konfiguration

(Vollständige Feldlisten: Siehe `src/lib/supabase/types.ts`)

---

## API ENDPOINTS

### Campaign Management
| Method | Path | Beschreibung |
|---|---|---|
| POST | /api/campaigns | Neue Kampagne anlegen |
| GET | /api/campaigns | Alle Kampagnen listen |
| GET | /api/campaigns/[id] | Detail + Stats |
| PATCH | /api/campaigns/[id] | Settings updaten |
| POST | /api/campaigns/[id]/upload | CSV hochladen + validieren |
| POST | /api/campaigns/[id]/start | Batch Pipeline starten |
| POST | /api/campaigns/[id]/pause | Pipeline pausieren |

### Lead Management
| Method | Path | Beschreibung |
|---|---|---|
| GET | /api/leads | Leads mit Filter, Sortierung, Pagination |
| GET | /api/leads/[id] | Detail |
| PATCH | /api/leads/[id] | Notes, Pipeline Status updaten |
| POST | /api/leads/[id]/enrich | Einzelnen Lead (re-)enrichen |
| POST | /api/leads/[id]/generate-pass | Einzelnen Pass (re-)generieren |
| POST | /api/leads/[id]/generate-strip | Einzelnes Strip Image (re-)generieren |
| POST | /api/leads/[id]/generate-email | Einzelne Email (re-)generieren |
| POST | /api/leads/[id]/generate-preview | Einzelnes Preview (re-)generieren |
| POST | /api/leads/[id]/classify-reply | Reply manuell klassifizieren |
| POST | /api/leads/[id]/send-test | Test-Email an eigene Adresse senden |
| DELETE | /api/leads/[id] | Lead löschen + optional Blacklist |

### 🔧 Tools API (manuelle Tests, kein Lead nötig)
| Method | Path | Beschreibung |
|---|---|---|
| POST | /api/tools/scrape | Website scrapen → Logo, Farben, Meta |
| POST | /api/tools/logo | Logo URL verarbeiten → alle Sizes + BG Removal |
| POST | /api/tools/classify | Business-Daten → AI Industry/Reward/Hooks |
| POST | /api/tools/strip | Industry + Farbe → Strip Image (Template oder AI) |
| POST | /api/tools/pass | Formular-Daten → Apple .pkpass + Google Save URL |
| POST | /api/tools/preview | Pass-Daten → iPhone Mockup PNG |
| POST | /api/tools/email | Lead-Daten + Strategie → Subject + Body |
| POST | /api/tools/classify-reply | Reply Text → Kategorie + Confidence + Draft |

### Pass & Download (Public)
| Method | Path | Beschreibung |
|---|---|---|
| GET | /d/[slug] | Download Page (SSR, Device Detection) |
| GET | /api/passes/[serial] | Apple .pkpass Download |
| GET | /api/passes/google/[id] | Google Wallet Redirect |
| POST | /api/sms/send | SMS mit Download-Link |

### Apple Wallet Callbacks (Public, Token Auth)
| Method | Path | Beschreibung |
|---|---|---|
| POST | /api/v1/devices/[deviceLib]/registrations/[passTypeId]/[serial] | Install Detection |
| DELETE | /api/v1/devices/[deviceLib]/registrations/[passTypeId]/[serial] | Unregister |
| GET | /api/v1/passes/[passTypeId]/[serial] | Pass Update Check |
| POST | /api/v1/log | Device Error Log |

### Webhooks
| Method | Path | Beschreibung |
|---|---|---|
| POST | /api/webhooks/instantly | Opens, Clicks, Replies, Bounces |
| POST | /api/webhooks/google-wallet | State Changes |

### Analytics
| Method | Path | Beschreibung |
|---|---|---|
| GET | /api/analytics/funnel | Conversion Funnel (filterbar by=industry/city/variant/strategy/weekday/hour) |
| GET | /api/analytics/campaigns | Kampagnen-Vergleich |
| GET | /api/analytics/ab-tests | A/B Ergebnisse + Winner Detection |

### System
| Method | Path | Beschreibung |
|---|---|---|
| GET | /api/health | Service Status Check (alle API Connections) |
| GET/POST | /api/settings | Globale Settings |

---

## IMPLEMENTIERUNGS-PHASEN

Jede Phase liefert: **Service + API Route + Test-UI + (bei Batch-Phasen) Trigger.dev Job**

### Phase 1: Projekt-Setup ✅ DONE
- Next.js 15, TypeScript, Tailwind, Supabase Client
- Dashboard Layout mit Sidebar
- Projektstruktur, Types, Health Check API

### Phase 2: Datenbank + CSV Import + Lead Verwaltung
**Service:**
- CSV Parser (SheetJS) mit flexiblem Spalten-Mapping
- Email Validator (Format + MX + Disposable + Blacklist)
- Slug Generator

**API:**
- Campaign CRUD
- Lead CRUD
- CSV Upload + Validation Endpoint

**Test-UI:**
- Campaign erstellen (Name eingeben)
- CSV Upload mit Drag & Drop
- Validation Report (valide/ungültig/duplikate pro Zeile)
- Lead-Liste mit Filter + Sortierung + Pagination
- Lead Detail View (Basis — wird in späteren Phasen erweitert)

**Definition of Done:**
- [ ] CSV hochladen → Validation Report sehen
- [ ] Leads in DB + sichtbar in Lead-Liste
- [ ] Filter nach Status, Campaign, Branche funktioniert
- [ ] Duplikate werden erkannt und angezeigt
- [ ] Lead Detail Page zeigt Import-Daten

---

### Phase 3: Enrichment Pipeline + Scraper Tool
**Service:**
- `lib/enrichment/scraper.ts` — scrapeWebsite(url)
- `lib/enrichment/logo.ts` — processLogo(url, bgColor)
- `lib/enrichment/colors.ts` — extractDominantColor(imageBuffer)
- `lib/enrichment/instagram.ts` — scrapeInstagram(handle)
- `lib/enrichment/fallback-logo.ts` — generateFallbackLogo(name, color)
- `lib/ai/classifier.ts` — classifyBusiness(data)
- `lib/enrichment/score.ts` — calculateLeadScore(lead)

**API:**
- POST /api/tools/scrape — Manuell testen
- POST /api/tools/logo — Manuell testen
- POST /api/tools/classify — Manuell testen
- POST /api/leads/[id]/enrich — Einzelnen Lead enrichen

**Test-UI (Tools Page):**
- 🔧 Scraper: URL eingeben → alle extrahierten Daten sehen
- 🔧 Logo Processor: URL/Upload → alle Sizes + BG Removal sehen
- 🔧 AI Classifier: Business-Daten → Industry/Reward/Hooks sehen

**Lead Detail Actions:**
- [🔄 Re-Scrape] Button
- [🔄 Re-Classify] Button
- Enrichment-Daten anzeigen (Logo, Farbe, Industry, Hooks)

**Batch Job:**
- `trigger/enrich-campaign.ts` — Fan-Out über alle Leads

**Definition of Done:**
- [ ] Tools/Scraper: URL eingeben → Logo, Farben, Meta, Social sichtbar
- [ ] Tools/Logo: Logo hochladen → 6 Varianten sehen + BG Removal
- [ ] Tools/Classifier: Daten eingeben → AI Ergebnis mit Hooks sehen
- [ ] Lead Detail: Re-Scrape Button funktioniert, Ergebnis live sichtbar
- [ ] Batch: Kampagne enrichen → Progress sichtbar → alle Leads enriched

---

### Phase 4: Strip Image System + Strip Tool
**Service:**
- `lib/wallet/strip.ts` — matchTemplate(industry, color) + generateWithAI(prompt)

**API:**
- POST /api/tools/strip — Manuell testen
- POST /api/leads/[id]/generate-strip — Einzeln generieren

**Test-UI:**
- 🔧 Strip Image: Industry + Farbe wählen → Template Preview sehen
- Alle 4 Varianten einer Industry nebeneinander
- Button: "AI generieren statt Template"

**Lead Detail Actions:**
- [🔄 Re-Generate Strip] Button
- Strip Image Preview anzeigen

**Definition of Done:**
- [ ] Tools/Strip: Industry + Farbe → passendes Template angezeigt
- [ ] Tools/Strip: AI Fallback → individuelles Bild generiert
- [ ] 60 Templates in DB (15 Industries × 4 Farben)
- [ ] Lead Detail: Strip Image sichtbar + Re-Generate funktioniert

---

### Phase 5: Pass Generation Engine + Pass Tool
**Service:**
- `lib/wallet/apple.ts` — generateApplePass(data) → Buffer
- `lib/wallet/google.ts` — generateGooglePass(data) → Save URL
- Referenz: ~/Desktop/passify/src/lib/wallet/ (NUR LESEN)

**API:**
- POST /api/tools/pass — Manuell Pass generieren (Formular-Daten)
- POST /api/leads/[id]/generate-pass — Pass für Lead generieren
- GET /api/passes/[serial] — .pkpass Download (Public)

**Test-UI:**
- 🔧 Pass Generator: Komplettes Formular → Pass generieren + downloaden
  - Apple Pass downloaden (.pkpass) und auf eigenem iPhone testen
  - Google Save URL öffnen und auf eigenem Android testen
  - Sofort sehen ob Logo, Farben, Strip, Felder stimmen

**Lead Detail Actions:**
- [⬇️ Download .pkpass] Button
- [🔗 Google Save URL] Button
- [🔄 Re-Generate Pass] Button
- Pass Status + Serial anzeigen

**Definition of Done:**
- [ ] Tools/Pass: Formular ausfüllen → .pkpass runterladen → auf iPhone installieren
- [ ] Tools/Pass: Google Save URL → auf Android installieren
- [ ] Location Relevance funktioniert (Pass zeigt sich bei Adresse)
- [ ] Endowed Progress: 3/10 Stempel sichtbar
- [ ] QR Code auf Pass verlinkt auf Download-Seite
- [ ] Lead Detail: Download + Re-Generate funktioniert

**⚠️ User Action:** Neue Apple Certificates + Google Wallet Issuer erstellen (Anleitung wird gegeben)

---

### Phase 6: Download-Seite + Device Registration + SMS
**Service:**
- `lib/tracking/events.ts` — logEvent(leadId, type, metadata)
- Device Registration Handler (Referenz: Passify)

**Seiten:**
- /d/[slug] — Public Download Page (Mobile + Desktop)

**API:**
- POST /api/v1/devices/.../registrations/... — Apple Install Detection
- POST /api/sms/send — SMS mit Link

**Test-UI:**
- 🔧 Download Page Preview: Slug wählen → Live Preview (Mobile + Desktop Toggle)
- Lead Detail: [👁️ Preview Download Page] Button → öffnet /d/{slug} in neuem Tab

**Lead Detail Actions:**
- [👁️ Preview Download Page] Button
- Pass Install Status anzeigen (installiert/nicht installiert + Platform)

**Definition of Done:**
- [ ] /d/{slug} sieht professionell aus auf Mobile (iPhone Mockup, animiert)
- [ ] /d/{slug} zeigt QR + SMS Option auf Desktop
- [ ] Ein-Klick Apple Wallet Install funktioniert
- [ ] Google Wallet Install funktioniert
- [ ] Install wird erkannt (Device Registration → DB Update)
- [ ] Dashboard zeigt Realtime Notification bei Install
- [ ] Tools/Download Page: Preview sichtbar für jeden Lead

**⚠️ User Action:** Twilio Account erstellen (für SMS)

---

### Phase 7: iPhone Mockup Preview Generator + Preview Tool
**Service:**
- `lib/wallet/preview.ts` — generatePreview(passData) → PNG Buffer

**API:**
- POST /api/tools/preview — Manuell generieren
- POST /api/leads/[id]/generate-preview — Für Lead generieren

**Test-UI:**
- 🔧 Preview: Pass-Daten eingeben ODER Lead wählen → iPhone Mockup sehen + downloaden

**Lead Detail Actions:**
- [🖼️ Re-Generate Preview] Button
- Preview Image anzeigen

**Definition of Done:**
- [ ] Tools/Preview: Daten eingeben → professionelles iPhone Mockup PNG
- [ ] Mockup zeigt Logo, Farben, Strip, Stamp Emojis, Reward, QR korrekt
- [ ] Lead Detail: Preview sichtbar + Download + Re-Generate

---

### Phase 8: Email Generation Engine + Email Tool
**Service:**
- `lib/email/writer.ts` — writeEmail(lead, strategy, variant, options)
- 5 Strategie-Prompts (curiosity, social_proof, direct, storytelling, provocation)

**API:**
- POST /api/tools/email — Manuell Email generieren
- POST /api/leads/[id]/generate-email — Für Lead generieren
- POST /api/leads/[id]/send-test — Test-Email an eigene Adresse

**Test-UI:**
- 🔧 Email Writer: Lead-Daten + Strategie → generierte Email sehen
- Alle 5 Strategien mit einem Klick durchprobieren
- [📨 Test an mich senden] Button
- Token Count + Kosten anzeigen

**Lead Detail Actions:**
- [📧 Preview Email] Button
- [🔄 Re-Generate Email] Button
- [📨 Send Test (an mich)] Button
- Email Subject + Body anzeigen

**Campaign Actions:**
- Review Queue: Erste 20 Emails ansehen + freigeben
- A/B Varianten-Zuordnung konfigurieren

**Definition of Done:**
- [ ] Tools/Email: 5 verschiedene Strategien → 5 verschiedene Emails sehen
- [ ] Jede Email personalisiert mit Hooks + Business-Daten
- [ ] Output Filter funktioniert (keine Spam-Wörter, max 200 Wörter)
- [ ] Test-Email kommt bei mir an
- [ ] Review Queue: Erste 20 Emails einer Kampagne manuell prüfbar
- [ ] Lead Detail: Email Preview + Re-Generate funktioniert

---

### Phase 9: Instantly.ai Integration
**Service:**
- `lib/email/instantly.ts` — Instantly API Client

**API:**
- POST /api/campaigns/[id]/sync-instantly — Leads zu Instantly pushen
- POST /api/webhooks/instantly — Tracking Events empfangen

**Test-UI:**
- Settings: Instantly Connection Status prüfen
- Campaign Detail: [🚀 An Instantly senden] Button
- Campaign Detail: Sync Status anzeigen

**Lead Detail Actions:**
- Email Status anzeigen (sent, opened, clicked, replied)
- Timestamps für jedes Event

**Definition of Done:**
- [ ] Instantly API Key testen → Connection Status grün
- [ ] Leads einer Kampagne zu Instantly pushen → dort sichtbar
- [ ] Opens, Clicks, Replies syncen zurück in unsere DB
- [ ] Lead Detail zeigt Email Events mit Timestamps
- [ ] Bounce → Lead Status auto-update

**⚠️ User Action:** Instantly Account konfigurieren, Domains verbinden, Warmup starten

---

### Phase 10: Dashboard UI (komplett)
**Was:** Alles zusammenbauen — Funnel, Pipeline, Activity Feed

**Pages:**
- Dashboard Home: Live Funnel + Active Campaigns + Recent Activity (Realtime)
- Campaign Detail: Stats, Progress, Lead-Liste, A/B Results
- Lead Pipeline: Kanban oder Tabelle nach Pipeline Status
- Lead Detail: Vollständig mit allen Sections aus dem Wireframe oben

**Definition of Done:**
- [ ] Dashboard Funnel zeigt echte Zahlen
- [ ] Recent Activity aktualisiert sich live (Supabase Realtime)
- [ ] Campaign Progress ist sichtbar während Batch läuft
- [ ] Lead Detail hat ALLE Action Buttons und sie funktionieren
- [ ] Pipeline View: Leads nach Status filterbar

---

### Phase 11: Follow-Up Automation + Reply Classifier + Reply Tool
**Service:**
- `lib/email/classifier.ts` — classifyReply(text)
- Follow-Up Engine (Branching Logic)

**API:**
- POST /api/tools/classify-reply — Manuell testen
- POST /api/leads/[id]/classify-reply — Für Lead Reply

**Test-UI:**
- 🔧 Reply Classifier: Text einfügen → Kategorie + Confidence + Draft Reply sehen
- Verschiedene Texte testen um Grenzfälle zu finden

**Lead Detail Actions:**
- [🔄 Re-Classify Reply] Button
- Reply Kategorie + Confidence anzeigen
- AI Draft Reply anzeigen + kopierbar

**Definition of Done:**
- [ ] Tools/Reply Classifier: Text → korrekte Kategorie in >90% der Fälle
- [ ] Low Confidence (<70%) → "needs_review" + Notification
- [ ] Follow-Up Sequenzen laufen automatisch nach Branching-Schema
- [ ] "interested" → Auto-Calendly Link
- [ ] "unsubscribe" → Blacklist + aus allen Sequenzen entfernt
- [ ] Dead Lead Recycling Cron funktioniert

---

### Phase 12: A/B Testing Framework
**Test-UI:**
- Campaign Erstellen: A/B Varianten konfigurieren
- Analytics: A/B Vergleich mit Scores + Winner Detection
- "Winner skalieren" Button

**Definition of Done:**
- [ ] Leads werden gleichmäßig auf Varianten verteilt
- [ ] Metriken pro Variante werden getrackt
- [ ] Winner Detection bei 15%+ Vorsprung + MIN_SAMPLE = 50
- [ ] "Winner skalieren" verteilt Rest-Leads auf Gewinner

---

### Phase 13: Analytics & Intelligence
**Test-UI:**
- Funnel nach Dimension filtern (Dropdown: by industry/city/variant/strategy/weekday/hour)
- Lead Score Ranking
- Sending Schedule Optimizer Dashboard

**Definition of Done:**
- [ ] Funnel nach allen Dimensionen filterbar
- [ ] Lead Scores basieren auf echten Conversion-Daten (wenn vorhanden)
- [ ] Export: CSV Download für Lead-Listen + Statistiken

---

### Phase 14: Testing + Go Live
- Test mit 100 echten Leads
- Alle Tools manuell durchtesten
- Jede Pipeline-Phase einzeln testen
- Alle Action Buttons auf Lead Detail testen
- Download-Seite Mobile + Desktop
- Pass Installation Apple + Google
- Follow-Up Sequenz beobachten
- Bug Fixes
- Dann: Skalierung auf 500, 1000, 5000

---

## EDGE CASES & FEHLERBEHANDLUNG

### Enrichment
| Fehler | Plan B |
|---|---|
| Website offline / 404 | Skip → Fallback Logo + AI nur mit Name |
| Bot-Protection (Cloudflare) | Skip nach 2 Retries → Instagram/Google |
| Redirect Loop | Max 5 Redirects → Skip |
| SSL abgelaufen | HTTP Fallback → Skip |
| Logo SVG | Sharp SVG → PNG 512x512 |
| Logo < 64px | REJECT → nächster Kandidat |
| Logo weißer BG | Sharp Background Removal |
| Logo Hero-Image (>2:1) | Skip → nächster Kandidat |
| Instagram privat | Skip → Google Places |
| Instagram Rate Limit | Backoff → Retry Queue (1h) |
| AI Classification Fehler | Retry 2x → Keyword-Mapping Fallback |
| Kein Logo nirgends | Generierter Buchstaben-Logo |

### Pass Generation
| Fehler | Plan B |
|---|---|
| Apple Cert abgelaufen | CRON: 30 Tage vorher Alert |
| Apple Cert corrupted | Startup Check: Test-Pass → Block + Alert |
| Google API 429 | Exponential Backoff + Jitter |
| Google API 5xx | 3x Retry → Skip Google, nur Apple |
| Strip > 1MB | Sharp: JPEG 85% |
| Canvas Crash | Worker Isolation in Trigger.dev |
| Geocoding Fail | Location Relevance weglassen |

### Email & Delivery
| Fehler | Plan B |
|---|---|
| Email ungültig | Format + MX + Disposable Check VOR Import |
| Hard Bounce | Instantly auto. Lead → bounced |
| Spam Complaint | Lead → blacklisted. Domain Score -10 |
| Instantly gesperrt | Backup Account in Settings |
| AI generiert Spam | Output Filter + Review Queue erste 20 |
| Reply Classifier unsicher | Confidence < 70% → needs_review |

### System
| Fehler | Plan B |
|---|---|
| Trigger.dev Timeout | Auto-Retry 3x → Lead "failed" + Alert |
| Supabase Connection Limit | PgBouncer, max 20 concurrent |
| Vercel Timeout (60s) | Alles Heavy → Trigger.dev |
| Storage voll | Alert bei 80%. Cleanup PNGs > 90 Tage |
| Claude Haiku Down | Retry 3x → Template-basierte Emails |

---

## ENVIRONMENT VARIABLES

```env
# Supabase (neues Projekt)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Apple Wallet (Phase 5)
APPLE_PASS_TYPE_ID=
APPLE_TEAM_ID=
APPLE_WWDR_CERT_BASE64=
APPLE_SIGNER_CERT_BASE64=
APPLE_SIGNER_KEY_BASE64=
APPLE_SIGNER_KEY_PASSPHRASE=

# Google Wallet (Phase 5)
GOOGLE_SERVICE_ACCOUNT_BASE64=
GOOGLE_ISSUER_ID=
GOOGLE_WALLET_WEBHOOK_TOKEN=

# AI
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# Email
INSTANTLY_API_KEY=
INSTANTLY_WEBHOOK_SECRET=

# SMS (Phase 6)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Google Places (Phase 3, optional)
GOOGLE_PLACES_API_KEY=

# App
NEXT_PUBLIC_BASE_URL=http://localhost:3000
CRON_SECRET=
TRIGGER_SECRET_KEY=
```
