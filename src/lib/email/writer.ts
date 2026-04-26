/**
 * Email Writer — Hyper-personalized Cold Emails
 *
 * Generates cold emails using Claude Haiku for natural German text.
 * 5 strategies: curiosity, social_proof, direct, storytelling, provocation
 *
 * Critical: Emails must sound 100% human. No AI patterns.
 * - NEVER use dashes (— or –)
 * - Du-Form: "Hey {Vorname},"
 * - Sie-Form: "Sehr geehrter Herr {Nachname},"
 * - Sign off as "Lano"
 */

import Anthropic from '@anthropic-ai/sdk'

// ─── Types ──────────────────────────────────────────────────────

export type EmailStrategy = 'curiosity' | 'social_proof' | 'direct' | 'storytelling' | 'provocation'

export type EmailInput = {
  business_name: string
  contact_name?: string | null
  contact_first_name?: string | null
  contact_last_name?: string | null
  industry?: string | null
  city?: string | null
  website_description?: string | null
  website_about?: string | null
  website_headlines?: string | null
  founding_year?: number | null
  google_rating?: number | null
  google_reviews_count?: number | null
  has_existing_loyalty?: boolean
  has_app?: boolean
  email_hooks?: string[]
  personalization_notes?: string | null
  detected_reward?: string | null
  download_url: string
  strategy: EmailStrategy
  formal?: boolean // default false (du-Form)
}

export type EmailOutput = {
  subject: string
  body: string
  strategy: EmailStrategy
  word_count: number
  tokens_in: number
  tokens_out: number
  cost_usd: number
}

// ─── Strategy Descriptions ──────────────────────────────────────

const STRATEGY_PROMPTS: Record<EmailStrategy, string> = {
  curiosity: `STRATEGIE: Curiosity
Mach den Empfänger neugierig. Sag dass du was für sein Geschäft gebaut hast, aber verrate nicht alles.
Der Link soll die Neugier stillen. Subject klingt persönlich, als hätte man sich Gedanken gemacht.`,

  social_proof: `STRATEGIE: Social Proof
Betone konkrete Zahlen: Google Bewertungen, Gründungsjahr, Stadtteil.
Zeig dass der Laden erfolgreich ist und dieses Tool verdient hat.
Subject enthält den Business-Namen + ein konkretes Kompliment.`,

  direct: `STRATEGIE: Direct
Komm sofort auf den Punkt. Was es ist, was es bringt, hier der Link.
Kein Smalltalk. Respekt vor der Zeit des Empfängers.
Subject ist klar und sachlich.`,

  storytelling: `STRATEGIE: Storytelling
Erzähl eine Mini-Geschichte. "Ich hab mir eure Seite angeschaut..." oder "Mir ist aufgefallen..."
Mach es persönlich. Subject beginnt mit "Warum" oder erzählt einen Moment.`,

  provocation: `STRATEGIE: Provocation
Stelle eine provokante Frage oder Aussage. Nicht beleidigend, aber zum Nachdenken anregend.
"Papierstempel in 2026?" oder "Eure Konkurrenz ist schon digital..."
Subject macht stutzig.`,
}

// ─── Text-Cleaning Helpers ──────────────────────────────────────

/**
 * Replaces every kind of dash that screams "AI-written" with natural punctuation.
 * Catches: em-dash (—), en-dash (–), double-hyphen (--), spaced hyphen ( - ),
 * then collapses double punctuation and stray whitespace.
 */
export function stripDashes(text: string, mode: 'subject' | 'body'): string {
  const rep = mode === 'subject' ? ', ' : '. '
  return text
    .replace(/\s*[—–]\s*/g, rep)
    .replace(/\s+-{2,}\s+/g, rep)
    .replace(/\s+-\s+/g, rep)
    .replace(/(\.\s*){2,}/g, '. ')
    .replace(/(,\s*){2,}/g, ', ')
    .replace(/\s+([.,!?:;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Strip any "Lano Aziz" the AI might have invented — only "Lano" allowed in body. */
export function enforceFirstNameOnly(body: string): string {
  return body.replace(/Lano\s+Aziz/g, 'Lano')
}

// ─── Email Generation ───────────────────────────────────────────

export async function writeEmail(input: EmailInput): Promise<EmailOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  // Auto-Formal-Logik (Lano-Regel: nur Vorname → du, nur Nachname → Sie).
  // Wenn `formal` explizit gesetzt ist, respektieren. Sonst aus Namen ableiten.
  const firstName = input.contact_first_name?.trim() || null
  const lastName = input.contact_last_name?.trim() || null
  const formal = input.formal ?? (Boolean(lastName) && !firstName)

  // Build greeting
  let greeting: string
  if (firstName && !formal) {
    greeting = `Beginne mit "Hey ${firstName},"`
  } else if (lastName && formal) {
    greeting = `Beginne mit "Sehr geehrter Herr ${lastName},"`
  } else if (formal) {
    greeting = 'Beginne mit "Guten Tag,"'
  } else {
    greeting = 'Beginne mit "Hey,"'
  }

  // Build context block
  const contextParts: string[] = []
  contextParts.push(`Name: ${input.business_name}`)
  if (input.contact_name) contextParts.push(`Ansprechpartner: ${input.contact_name}`)
  if (input.city) contextParts.push(`Stadt: ${input.city}`)
  if (input.industry) contextParts.push(`Branche: ${input.industry}`)
  if (input.website_about) contextParts.push(`Über das Geschäft: ${input.website_about}`)
  else if (input.website_description) contextParts.push(`Beschreibung: ${input.website_description}`)
  if (input.website_headlines) contextParts.push(`Website-Headlines: ${input.website_headlines}`)
  // Rating-Filter: Nur erwaehnen wenn >=4.5 Sterne UND >=200 Reviews
  const ratingQualifies = !!(input.google_rating && input.google_rating >= 4.5
    && input.google_reviews_count && input.google_reviews_count >= 200)
  if (ratingQualifies) {
    contextParts.push(`Google: ${input.google_rating} Sterne, ${input.google_reviews_count} Bewertungen`)
  } else if (input.google_rating) {
    console.log(`[Email] Rating filter ACTIVE: ${input.google_rating}★, ${input.google_reviews_count || 0} Reviews — not included in email`)
  }
  if (input.founding_year) contextParts.push(`Gegründet: ${input.founding_year}`)
  if (input.has_existing_loyalty) contextParts.push('Hat bereits eine Treuekarte/Stempelkarte')
  if (input.has_app) contextParts.push('Hat eine eigene App')

  const hooksBlock = input.email_hooks?.length
    ? `PERSONALISIERUNG:\n${input.email_hooks.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
    : ''

  const notesBlock = input.personalization_notes
    ? `NOTIZEN: ${input.personalization_notes}`
    : ''

  const prompt = `Du schreibst eine kurze Cold Email an ein lokales Geschäft.

GESCHÄFT:
${contextParts.join('\n')}

${hooksBlock}
${notesBlock}

${STRATEGY_PROMPTS[input.strategy]}${!ratingQualifies && input.strategy === 'social_proof'
    ? '\nWICHTIG: Erwähne KEINE Google-Bewertungen, Sterne oder Reviews. Nutze stattdessen: Gründungsjahr, Instagram-Follower, Standort, oder das Geschäft selbst als Social Proof.'
    : !ratingQualifies ? '\nErwähne keine Google-Bewertungen.' : ''}

LINK zur Demo-Treuekarte: ${input.download_url}
${input.detected_reward ? `Prämie auf der Karte: ${input.detected_reward}` : ''}

REGELN:
${greeting}
Max 100 Wörter Body (ohne Anrede und Grüße).
${formal ? 'Sieze den Empfänger.' : 'Duze den Empfänger.'}
Schreibe wie ein echter Mensch, NICHT wie eine AI.
NIEMALS Gedankenstriche verwenden. Kein — und kein –. Niemals.
Keine Aufzählungen, keine Bulletpoints, keine Nummerierungen.
Kurze Sätze. Natürlich. Wie eine echte Nachricht an einen Bekannten.
Kein Firmenname des Absenders. Du bist ein Einzelunternehmer der hilft.
Der Link steht einfach als URL da, ohne "Klick hier" oder "Schau mal hier".
Ende mit "Viele Grüße\\nLano"
Keine Emojis im Body. Max 1 Emoji im Subject (optional).
Subject: max 50 Zeichen, persönlich, ${input.strategy === 'provocation' ? 'provokant' : 'neugierig machend'}.

Antworte NUR mit JSON: {"subject": "...", "body": "..."}`

  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  // Parse JSON response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned no JSON')

  const parsed = JSON.parse(jsonMatch[0]) as { subject?: string; body?: string }
  let subject = parsed.subject || ''
  let body = parsed.body || ''

  // Post-processing: alle AI-Tells rauspatchen
  subject = stripDashes(subject, 'subject')
  body = stripDashes(body, 'body')
  body = enforceFirstNameOnly(body)

  // Count tokens + cost
  const tokensIn = response.usage.input_tokens
  const tokensOut = response.usage.output_tokens
  const costUsd = (tokensIn * 0.80 + tokensOut * 4.00) / 1_000_000

  const wordCount = body.split(/\s+/).filter(Boolean).length

  console.log(`[Email] ${input.strategy}: "${subject}" (${wordCount} words, $${costUsd.toFixed(5)})`)

  return {
    subject,
    body,
    strategy: input.strategy,
    word_count: wordCount,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd,
  }
}
