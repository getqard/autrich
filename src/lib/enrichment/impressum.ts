/**
 * Impressum Scraper — Contact Name + Founding Year
 *
 * Scrapes the /impressum page of German websites to extract:
 * - Owner/manager name (Inhaber, Geschäftsführer, etc.)
 * - Founding year (seit XXXX, gegründet XXXX)
 *
 * Cost: $0 (just HTML parsing)
 */

import * as cheerio from 'cheerio'

export type ImpressumResult = {
  contactName: string | null
  firstName: string | null
  lastName: string | null
  foundingYear: number | null
  source: string | null
}

// Title patterns to strip from names
const TITLE_PATTERNS = /\b(Dipl\.|Dr\.|Prof\.|Ing\.|MBA|M\.A\.|B\.A\.|RA |StB )/gi

// Company suffixes to detect non-person names
const COMPANY_SUFFIXES = /\b(GmbH|UG|AG|e\.K\.|OHG|KG|GbR|mbH|haftungsbeschränkt|Co\.|Inc\.|Ltd\.|SE)\b/i

// Name extraction patterns (ordered by priority)
const NAME_PATTERNS = [
  /(?:Inhaber(?:in)?)\s*:?\s*(.+)/i,
  /(?:Geschäftsführer(?:in)?)\s*:?\s*(.+)/i,
  /(?:Vertreten durch)\s*:?\s*(.+)/i,
  /(?:Betreiber.*?vertreten durch)\s*:?\s*(.+)/i,
  /(?:Verantwortlich(?:er)?(?:\s+(?:i\.?\s*S\.?\s*d\.?|im Sinne|gem(?:äß|\.)))?\s*(?:§.*?)?)\s*:?\s*(.+)/i,
  /(?:Redaktionell verantwortlich)\s*:?\s*(.+)/i,
  /(?:Betriebsleiter(?:in)?)\s*:?\s*(.+)/i,
  /(?:Ansprechpartner(?:in)?)\s*:?\s*(.+)/i,
  /(?:Name und Anschrift)\s*:?\s*(.+)/i,
  /(?:Angaben gemäß|Angaben gem\.)\s*§.*?\s*:?\s*(.+)/i,
  /(?:Diensteanbieter|Betreiber)\s*:?\s*(.+)/i,
  /(?:Vertretungsberechtigt(?:er)?)\s+(?:ist\s+)?(?:Hr\.|Herr|Fr\.|Frau)?\s*(.+?)(?:\s+als\b|\s*$)/i,
  /(?:Kontakt)\s*:?\s*(.+)/i,
]

// Founding year patterns
const YEAR_PATTERNS = [
  /(?:seit|gegründet|established|founded|est\.?)\s*(\d{4})/i,
  /(?:seit über \d+ Jahren|seit mehr als \d+ Jahren)/i, // "seit über 20 Jahren" — no exact year
]

/**
 * Find the Impressum link on a page.
 */
function findImpressumLink(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html)

  const patterns = ['impressum', 'imprint', 'legal', 'rechtliches', 'rechtliche-hinweise']

  for (const pattern of patterns) {
    const link = $(`a[href*="${pattern}" i]`).first()
    if (link.length) {
      const href = link.attr('href')
      if (href) {
        try {
          return new URL(href, baseUrl).toString()
        } catch {
          return null
        }
      }
    }
  }

  return null
}

/**
 * Clean and validate an extracted name.
 */
function cleanName(raw: string): { full: string; first: string; last: string } | null {
  let name = raw.trim()

  // Stop at line breaks, commas (often followed by address), pipes
  name = name.split(/[\n\r,|]/).at(0)?.trim() || ''

  // Take only the first person if multiple ("Ahmed Müller und Fatih Yilmaz")
  name = name.split(/\s+und\s+|\s*&\s*|\s*\/\s*/i).at(0)?.trim() || ''

  // Remove titles
  name = name.replace(TITLE_PATTERNS, '').trim()

  // Remove parenthetical content
  name = name.replace(/\(.*?\)/g, '').trim()

  // If it looks like a company name, skip
  if (COMPANY_SUFFIXES.test(name)) return null

  // Must have at least 2 parts (first + last name)
  const parts = name.split(/\s+/).filter(p => p.length >= 2)
  if (parts.length < 2) return null

  // Must not be too long (probably captured too much)
  if (parts.length > 4) return null

  const first = parts[0]
  const last = parts[parts.length - 1]
  const full = parts.join(' ')

  // Basic sanity: names should start with uppercase
  if (!/^[A-ZÄÖÜ]/.test(first)) return null

  return { full, first, last }
}

/**
 * Extract founding year from text.
 */
function extractFoundingYear(text: string): number | null {
  for (const pattern of YEAR_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const year = parseInt(match[1])
      if (year >= 1900 && year <= new Date().getFullYear()) {
        return year
      }
    }
  }
  return null
}

/**
 * Scrape the Impressum page and extract contact name + founding year.
 */
export async function scrapeImpressum(
  homepageHtml: string,
  baseUrl: string,
): Promise<ImpressumResult> {
  const result: ImpressumResult = {
    contactName: null,
    firstName: null,
    lastName: null,
    foundingYear: null,
    source: null,
  }

  // First try to extract founding year from homepage
  const homepageText = cheerio.load(homepageHtml).text()
  result.foundingYear = extractFoundingYear(homepageText)

  // Find Impressum link
  const impressumUrl = findImpressumLink(homepageHtml, baseUrl)
  if (!impressumUrl) {
    console.log('[Impressum] No impressum link found')
    return result
  }

  // Fetch Impressum page
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(impressumUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      console.log(`[Impressum] ${impressumUrl} returned ${res.status}`)
      return result
    }

    const html = await res.text()
    const $ = cheerio.load(html)

    // Replace <br> tags with newlines BEFORE extracting text
    // Otherwise "Name und Anschrift<br>Hawjen Jaaf" becomes "Name und AnschriftHawjen Jaaf"
    $('br').replaceWith('\n')
    $('p, div, h1, h2, h3, h4, h5, h6, li, td').each((_, el) => {
      $(el).append('\n')
    })
    const pageText = $('body').text()

    // Try to extract founding year from impressum too
    if (!result.foundingYear) {
      result.foundingYear = extractFoundingYear(pageText)
    }

    // First try regex patterns (fast, $0)
    const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean)
    for (const pattern of NAME_PATTERNS) {
      for (const line of lines) {
        const match = line.match(pattern)
        if (match?.[1]) {
          const cleaned = cleanName(match[1])
          if (cleaned) {
            result.contactName = cleaned.full
            result.firstName = cleaned.first
            result.lastName = cleaned.last
            result.source = 'regex'
            console.log(`[Impressum] Regex found: ${cleaned.full}`)
            return result
          }
        }
      }
    }

    // Regex failed — use Haiku AI to extract name (~$0.0005)
    console.log('[Impressum] Regex failed, trying Haiku AI...')
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('No API key')

      const client = new Anthropic()
      const trimmedText = pageText.substring(0, 1500) // Manche Impressums haben den Namen weiter unten

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `Aus diesem Impressum-Text: Wer ist der Inhaber/Geschäftsführer? Nur den Personennamen extrahieren, keine Firma.

Text:
${trimmedText}

Antworte NUR mit JSON: {"name": "Vorname Nachname"} oder {"name": null} wenn kein Name gefunden.`,
        }],
      })

      const aiText = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text).join('')

      const jsonMatch = aiText.match(/\{[^}]+\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { name?: string | null }
        if (parsed.name && typeof parsed.name === 'string') {
          const cleaned = cleanName(parsed.name)
          if (cleaned) {
            result.contactName = cleaned.full
            result.firstName = cleaned.first
            result.lastName = cleaned.last
            result.source = 'ai'
            console.log(`[Impressum] AI found: ${cleaned.full}`)

            // Also try founding year from AI text if not found yet
            if (!result.foundingYear) {
              result.foundingYear = extractFoundingYear(trimmedText)
            }
            return result
          }
        }
      }
      console.log('[Impressum] AI could not find name')
    } catch (err) {
      console.log(`[Impressum] AI failed: ${err instanceof Error ? err.message : err}`)
    }
  } catch (err) {
    console.log(`[Impressum] Failed: ${err instanceof Error ? err.message : err}`)
  }

  return result
}

/**
 * Extract headlines (h1, h2, h3) from homepage for AI context.
 */
export function extractHeadlines(html: string): string {
  const $ = cheerio.load(html)
  const headlines: string[] = []

  $('h1, h2, h3').each((_, el) => {
    const text = $(el).text().trim()
    if (text && text.length > 3 && text.length < 200) {
      headlines.push(text)
    }
  })

  return headlines.slice(0, 10).join(' | ').substring(0, 500)
}

/**
 * Find and extract "About us" page content.
 */
export async function extractAboutPage(html: string, baseUrl: string): Promise<string | null> {
  const $ = cheerio.load(html)
  const patterns = ['ueber-uns', 'uber-uns', 'about', 'wir', 'team', 'geschichte', 'story']

  for (const pattern of patterns) {
    const link = $(`a[href*="${pattern}" i]`).first()
    if (!link.length) continue

    const href = link.attr('href')
    if (!href) continue

    try {
      const aboutUrl = new URL(href, baseUrl).toString()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(aboutUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      })
      clearTimeout(timeout)

      if (!res.ok) continue

      const aboutHtml = await res.text()
      const about$ = cheerio.load(aboutHtml)

      // Get first meaningful paragraph
      const paragraphs = about$('p')
        .map((_, el) => about$(el).text().trim())
        .get()
        .filter(t => t.length > 50 && t.length < 500)

      if (paragraphs.length > 0) {
        console.log(`[About] Found about text from ${aboutUrl}`)
        return paragraphs[0].substring(0, 300)
      }
    } catch {
      continue
    }
  }

  return null
}
