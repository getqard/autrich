#!/usr/bin/env npx tsx

/**
 * Generate all strip templates locally (no Vercel timeout).
 *
 * Usage:
 *   npx tsx scripts/generate-strips.ts                    # all remaining
 *   npx tsx scripts/generate-strips.ts --industry=cafe    # just cafe
 *   npx tsx scripts/generate-strips.ts --no-skip          # regenerate all
 */

// Load .env.local manually (no dotenv dependency)
import { readFileSync } from 'fs'
try {
  const envContent = readFileSync('.env.local', 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.substring(0, eqIdx).trim()
    const val = trimmed.substring(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* no .env.local, use existing env */ }

import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'

// ─── Config ─────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GEMINI_KEY = process.env.GEMINI_API_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_KEY) {
  console.error('Missing env vars. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY })

const STRIP_WIDTH = 1125
const STRIP_HEIGHT = 432

type AccentFamily = 'warm' | 'red' | 'cool' | 'green' | 'pink' | 'purple' | 'neutral'

const FAMILIES: { name: AccentFamily; aiHint: string }[] = [
  { name: 'warm',    aiHint: 'golden amber warm candlelight, sunset glow, cozy elegance' },
  { name: 'red',     aiHint: 'crimson fire dramatic red, bold intensity, fiery energy' },
  { name: 'cool',    aiHint: 'blue neon cool steel, clean modern, crisp precision' },
  { name: 'green',   aiHint: 'green fresh natural emerald, organic vitality, zen' },
  { name: 'pink',    aiHint: 'pink rose feminine luxe, soft glamour, pastel elegance' },
  { name: 'purple',  aiHint: 'purple violet luxury mystic, deep regal atmosphere' },
  { name: 'neutral', aiHint: 'dark moody neutral cinematic' },
]

const SUBJECTS: Record<string, string> = {
  doener: 'Döner kebab on vertical spit',
  barber: 'Barbershop, straight razor, leather chair',
  cafe: 'Latte art, coffee beans',
  pizzeria: 'Pizza, wood-fired oven',
  baeckerei: 'Fresh bread loaves, pastries',
  restaurant: 'Fine dining plate, candlelight',
  shisha: 'Hookah with smoke wisps',
  nagelstudio: 'Nail polish bottles, manicure',
  kosmetik: 'Skincare products, serum dropper',
  fitnessstudio: 'Gym weights, dumbbells',
  waschanlage: 'Car wash, water spray, foam',
  eisdiele: 'Gelato scoops, waffle cone',
  sushi: 'Sushi nigiri on dark slate',
  burger: 'Burger with cheese pull',
  blumenladen: 'Flower bouquet, colorful blooms',
  imbiss: 'Currywurst with fries',
  tattoo: 'Tattoo machine, ink bottles',
  yogastudio: 'Yoga mat, zen space',
  tierhandlung: 'Pet shop, cute animals',
  reinigung: 'Clean garments on hangers',
  generic: 'Abstract premium atmospheric scene, bokeh lights, dramatic shadows, luxury textures',
}

const FOOD_INDUSTRIES = new Set(['doener', 'cafe', 'pizzeria', 'baeckerei', 'restaurant', 'sushi', 'burger', 'eisdiele', 'imbiss'])

const INDUSTRY_NAMES: Record<string, string> = {
  doener: 'Döner/Kebab', barber: 'Barber/Friseur', cafe: 'Café', pizzeria: 'Pizzeria',
  baeckerei: 'Bäckerei', restaurant: 'Restaurant', shisha: 'Shisha Bar',
  nagelstudio: 'Nagelstudio', kosmetik: 'Kosmetik/Beauty', fitnessstudio: 'Fitnessstudio',
  waschanlage: 'Autowaschanlage', eisdiele: 'Eisdiele', sushi: 'Sushi Restaurant',
  burger: 'Burger Restaurant', blumenladen: 'Blumenladen', imbiss: 'Imbiss/Snackbar',
  tattoo: 'Tattoo Studio', yogastudio: 'Yoga/Pilates Studio', tierhandlung: 'Tierhandlung',
  reinigung: 'Textilreinigung', generic: 'Generic',
}

// ─── Prompt Builder ─────────────────────────────────────────────

function buildPrompt(industry: string, family: AccentFamily): string {
  const subject = SUBJECTS[industry] || industry
  const fam = FAMILIES.find(f => f.name === family)!
  const isFood = FOOD_INDUSTRIES.has(industry)

  let accentRule: string
  if (family === 'neutral') {
    accentRule = 'Dark moody cinematic lighting. No specific color accent. Monochrome atmosphere.'
  } else if (isFood) {
    accentRule = `Food lit with warm appetizing lighting. ${fam.aiHint} color mood only in background ambient glow. Never tint the food.`
  } else {
    accentRule = `${fam.aiHint} atmosphere throughout the scene — in lighting, surfaces, and ambient glow.`
  }

  return `Wide header image for a loyalty card.
SUBJECT: ${subject}
STYLE: ${family !== 'neutral' ? fam.aiHint : 'dark moody cinematic'}
${accentRule}

COMPOSITION:
- Wide cinematic framing (16:9).
- Place the main subject on the RIGHT SIDE of the frame.
- Dark/moody preferred.
- NO TEXT. NO LOGOS.
- The image should look like a premium header for a wallet pass.

A beautiful, commercial-grade shot of ${subject.split(',')[0]}. The lighting is dramatic. The subject is clearly visible on the right.`
}

// ─── Image Generation ───────────────────────────────────────────

async function generateImage(prompt: string): Promise<Buffer> {
  // Try Gemini 3 Pro first
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: [prompt],
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '16:9' as unknown as undefined },
      },
    })
    const part = response.candidates?.[0]?.content?.parts?.[0]
    if (part?.inlineData?.data) {
      return Buffer.from(part.inlineData.data, 'base64')
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`   ⚠️ Gemini 3 Pro failed: ${msg.substring(0, 80)}`)
  }

  // Fallback: Imagen 4 Fast
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '16:9', personGeneration: 'DONT_ALLOW' },
      }),
    }
  )
  if (!response.ok) throw new Error(`Imagen ${response.status}: ${await response.text()}`)
  const result = await response.json()
  if (!result.predictions?.[0]?.bytesBase64Encoded) throw new Error('No image data')
  return Buffer.from(result.predictions[0].bytesBase64Encoded, 'base64')
}

async function cropRightAligned(rawBuffer: Buffer): Promise<Buffer> {
  const { createCanvas, loadImage } = await import('canvas')
  const canvas = createCanvas(STRIP_WIDTH, STRIP_HEIGHT)
  const ctx = canvas.getContext('2d')
  const img = await loadImage(rawBuffer)

  const scale = Math.max(STRIP_WIDTH / img.width, STRIP_HEIGHT / img.height)
  const sw = img.width * scale
  const sh = img.height * scale
  ctx.drawImage(img, STRIP_WIDTH - sw, (STRIP_HEIGHT - sh) / 2, sw, sh)

  return canvas.toBuffer('image/png')
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
const args = process.argv.slice(2)
const industryArg = args.find(a => a.startsWith('--industry='))?.split('=')[1]
const familyArg = args.find(a => a.startsWith('--family='))?.split('=')[1] as AccentFamily | undefined
const noSkip = args.includes('--no-skip')

const industries = industryArg ? [industryArg] : Object.keys(SUBJECTS)
const families = familyArg ? [FAMILIES.find(f => f.name === familyArg)!] : FAMILIES

// Check existing
let existingKeys = new Set<string>()
if (!noSkip) {
  const { data } = await supabase.from('strip_templates').select('industry_slug, accent_family')
  if (data) existingKeys = new Set(data.map((t: { industry_slug: string; accent_family: string }) => `${t.industry_slug}/${t.accent_family}`))
}

const total = industries.length * families.length
console.log(`\n🎨 Generating ${total} strip templates (${existingKeys.size} existing, skip=${!noSkip})\n`)

let generated = 0, skipped = 0, failed = 0
const errors: string[] = []
const t0 = Date.now()

for (const ind of industries) {
  for (const fam of families) {
    const key = `${ind}/${fam.name}`

    if (!noSkip && existingKeys.has(key)) {
      skipped++
      continue
    }

    try {
      const prompt = buildPrompt(ind, fam.name)
      const raw = await generateImage(prompt)
      const cropped = await cropRightAligned(raw)

      const path = `${ind}/${fam.name}.png`
      const { error: upErr } = await supabase.storage
        .from('strip-templates')
        .upload(path, cropped, { contentType: 'image/png', upsert: true })
      if (upErr) throw new Error(`Upload: ${upErr.message}`)

      const { data: urlData } = supabase.storage.from('strip-templates').getPublicUrl(path)

      await supabase.from('strip_templates').upsert({
        industry: INDUSTRY_NAMES[ind] || ind,
        industry_slug: ind,
        accent_family: fam.name,
        image_url: urlData.publicUrl,
        storage_path: path,
        prompt_used: prompt,
      }, { onConflict: 'industry_slug,accent_family' })

      generated++
      console.log(`✅ ${key} (${generated + skipped + failed}/${total})`)
    } catch (err: unknown) {
      failed++
      const msg = err instanceof Error ? err.message : 'Unknown'
      errors.push(`${key}: ${msg}`)
      console.error(`❌ ${key}: ${msg.substring(0, 100)}`)
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 1000))
  }
}

console.log(`\n✅ ${generated} generated | ⏭️ ${skipped} skipped | ❌ ${failed} failed | ⏱️ ${((Date.now() - t0) / 1000).toFixed(0)}s`)
if (errors.length) { console.log('\nErrors:'); errors.forEach(e => console.log(`  ${e}`)) }
process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
