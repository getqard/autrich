#!/usr/bin/env node

/**
 * Generate all strip templates locally (no Vercel timeout, no Next.js).
 * Pure Node.js — uses fetch directly against Supabase + Gemini APIs.
 *
 * Usage:
 *   node scripts/generate-strips.mjs                    # all remaining
 *   node scripts/generate-strips.mjs --industry=cafe    # just cafe
 *   node scripts/generate-strips.mjs --no-skip          # regenerate all
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { createCanvas, loadImage } from 'canvas'

// ─── Load .env.local ────────────────────────────────────────────

try {
  const envContent = readFileSync('.env.local', 'utf8')
  for (const line of envContent.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.substring(0, eq).trim()
    const val = t.substring(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* no .env.local */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY = process.env.GEMINI_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_KEY) {
  console.error('Missing env vars. Check .env.local for NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY')
  process.exit(1)
}

// ─── Config ─────────────────────────────────────────────────────

const STRIP_WIDTH = 1125
const STRIP_HEIGHT = 432

const FAMILIES = [
  { name: 'warm',    aiHint: 'golden amber warm candlelight, sunset glow, cozy elegance' },
  { name: 'red',     aiHint: 'crimson fire dramatic red, bold intensity, fiery energy' },
  { name: 'cool',    aiHint: 'blue neon cool steel, clean modern, crisp precision' },
  { name: 'green',   aiHint: 'green fresh natural emerald, organic vitality, zen' },
  { name: 'pink',    aiHint: 'pink rose feminine luxe, soft glamour, pastel elegance' },
  { name: 'purple',  aiHint: 'purple violet luxury mystic, deep regal atmosphere' },
  { name: 'neutral', aiHint: 'dark moody neutral cinematic' },
]

const SUBJECTS = {
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
  tuerkisch: 'Turkish grilled kebab plate, pide bread',
  asiatisch: 'Asian wok noodles, chopsticks, steam',
  griechisch: 'Greek gyros plate, feta, olives',
  mexikanisch: 'Mexican tacos, nachos, guacamole',
  indisch: 'Indian curry, naan bread, spices',
  bar: 'Cocktail glasses, bar counter, bottles',
  brunch: 'Brunch plate, avocado toast, eggs',
  bierbar: 'Craft beer glasses, tap handle, hops',
  apotheke: 'Pharmacy, medicine bottles, health products',
  autowerkstatt: 'Car repair garage, tools, engine',
  handyladen: 'Smartphone screens, phone repair tools',
  massage: 'Massage table, hot stones, candles',
  hundepflege: 'Dog grooming, cute dog, grooming tools',
  fahrradladen: 'Bicycles, bike workshop, tools',
  generic: 'Abstract premium atmospheric scene, bokeh lights, dramatic shadows, luxury textures',
}

const FOOD = new Set(['doener','cafe','pizzeria','baeckerei','restaurant','sushi','burger','eisdiele','imbiss','tuerkisch','asiatisch','griechisch','mexikanisch','indisch','brunch','bierbar'])

const NAMES = {
  doener:'Döner/Kebab', barber:'Barber/Friseur', cafe:'Café', pizzeria:'Pizzeria',
  baeckerei:'Bäckerei', restaurant:'Restaurant', shisha:'Shisha Bar',
  nagelstudio:'Nagelstudio', kosmetik:'Kosmetik/Beauty', fitnessstudio:'Fitnessstudio',
  waschanlage:'Autowaschanlage', eisdiele:'Eisdiele', sushi:'Sushi Restaurant',
  burger:'Burger Restaurant', blumenladen:'Blumenladen', imbiss:'Imbiss/Snackbar',
  tattoo:'Tattoo Studio', yogastudio:'Yoga/Pilates Studio', tierhandlung:'Tierhandlung',
  reinigung:'Textilreinigung', tuerkisch:'Türkisches Restaurant', asiatisch:'Asiatisches Restaurant',
  griechisch:'Griechisches Restaurant', mexikanisch:'Mexikanisches Restaurant',
  indisch:'Indisches Restaurant', bar:'Bar/Cocktailbar', brunch:'Frühstück/Brunch',
  bierbar:'Craft Beer/Biergarten', apotheke:'Apotheke', autowerkstatt:'Autowerkstatt',
  handyladen:'Handyladen/Reparatur', massage:'Massage/Physiotherapie',
  hundepflege:'Hundesalon/Hundepflege', fahrradladen:'Fahrradladen/Werkstatt', generic:'Generic',
}

// ─── Prompt Builder ─────────────────────────────────────────────

function buildPrompt(industry, familyName) {
  const subject = SUBJECTS[industry] || industry
  const fam = FAMILIES.find(f => f.name === familyName)

  let accentRule
  if (familyName === 'neutral') {
    accentRule = 'Dark moody cinematic lighting. No specific color accent. Monochrome atmosphere.'
  } else if (FOOD.has(industry)) {
    accentRule = `Food lit with warm appetizing lighting. ${fam.aiHint} color mood only in background ambient glow. Never tint the food.`
  } else {
    accentRule = `${fam.aiHint} atmosphere throughout the scene — in lighting, surfaces, and ambient glow.`
  }

  return `Wide header image for a loyalty card.
SUBJECT: ${subject}
STYLE: ${familyName !== 'neutral' ? fam.aiHint : 'dark moody cinematic'}
${accentRule}

COMPOSITION:
- Wide cinematic framing (16:9).
- Place the main subject on the RIGHT SIDE of the frame.
- Dark/moody preferred.
- NO TEXT. NO LOGOS.
- The image should look like a premium header for a wallet pass.

A beautiful, commercial-grade shot of ${subject.split(',')[0]}. The lighting is dramatic. The subject is clearly visible on the right.`
}

// ─── Supabase Helpers ───────────────────────────────────────────

async function supabaseQuery(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=minimal',
    },
    ...options,
  })
  if (!res.ok && options.method !== 'GET') {
    const text = await res.text()
    throw new Error(`Supabase ${res.status}: ${text}`)
  }
  return res
}

async function uploadToStorage(path, buffer) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/strip-templates/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: buffer,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Storage upload ${res.status}: ${text}`)
  }
  return `${SUPABASE_URL}/storage/v1/object/public/strip-templates/${path}`
}

// ─── Image Generation ───────────────────────────────────────────

async function generateImage(prompt) {
  // Try Gemini 3 Pro Image first
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=' + GEMINI_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } },
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const part = data.candidates?.[0]?.content?.parts?.[0]
      if (part?.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64')
      }
    } else {
      const err = await res.text()
      console.log(`   ⚠️  Gemini 3 Pro: ${err.substring(0, 80)}`)
    }
  } catch (err) {
    console.log(`   ⚠️  Gemini 3 Pro: ${err.message?.substring(0, 80)}`)
  }

  // Fallback: Imagen 4 Fast
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '16:9', personGeneration: 'DONT_ALLOW' },
    }),
  })
  if (!res.ok) throw new Error(`Imagen ${res.status}: ${(await res.text()).substring(0, 100)}`)
  const data = await res.json()
  if (!data.predictions?.[0]?.bytesBase64Encoded) throw new Error('No image data returned')
  return Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64')
}

async function cropRightAligned(rawBuffer) {
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

const args = process.argv.slice(2)
const industryArg = args.find(a => a.startsWith('--industry='))?.split('=')[1]
const noSkip = args.includes('--no-skip')

const industries = industryArg ? [industryArg] : Object.keys(SUBJECTS)

// Get existing templates
let existingKeys = new Set()
if (!noSkip) {
  try {
    const res = await supabaseQuery('strip_templates?select=industry_slug,accent_family', { method: 'GET' })
    const data = await res.json()
    existingKeys = new Set(data.map(t => `${t.industry_slug}/${t.accent_family}`))
  } catch { /* ignore */ }
}

const total = industries.length * FAMILIES.length
console.log(`\n🎨 Strip Template Generator`)
console.log(`   ${industries.length} industries × ${FAMILIES.length} families = ${total} templates`)
console.log(`   ${existingKeys.size} already exist, skip=${!noSkip}\n`)

let generated = 0, skipped = 0, failed = 0
const errors = []
const t0 = Date.now()

for (const ind of industries) {
  for (const fam of FAMILIES) {
    const key = `${ind}/${fam.name}`

    if (!noSkip && existingKeys.has(key)) {
      skipped++
      continue
    }

    try {
      const prompt = buildPrompt(ind, fam.name)
      const raw = await generateImage(prompt)
      const cropped = await cropRightAligned(raw)

      const storagePath = `${ind}/${fam.name}.png`
      const imageUrl = await uploadToStorage(storagePath, cropped)

      // Upsert DB record (on_conflict needed for PostgREST upsert)
      await supabaseQuery('strip_templates?on_conflict=industry_slug,accent_family', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify({
          industry: NAMES[ind] || ind,
          industry_slug: ind,
          accent_family: fam.name,
          image_url: imageUrl,
          storage_path: storagePath,
          prompt_used: prompt,
        }),
      })

      generated++
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0)
      console.log(`✅ ${key} (${generated + skipped + failed}/${total}) [${elapsed}s]`)
    } catch (err) {
      failed++
      errors.push(`${key}: ${err.message}`)
      console.error(`❌ ${key}: ${err.message?.substring(0, 120)}`)
    }

    // Rate limit: 1.5s between requests
    await new Promise(r => setTimeout(r, 1500))
  }
}

const duration = ((Date.now() - t0) / 1000 / 60).toFixed(1)
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`✅ Generated: ${generated}`)
console.log(`⏭️  Skipped:   ${skipped}`)
console.log(`❌ Failed:     ${failed}`)
console.log(`⏱️  Duration:   ${duration} min`)

if (errors.length) {
  console.log(`\nErrors:`)
  errors.forEach(e => console.log(`  - ${e}`))
}

console.log()
