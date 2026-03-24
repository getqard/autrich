/**
 * Strip Image Generator — Gemini Image Generation
 *
 * Generates atmospheric 1125x432 strip images for Apple Wallet passes.
 * Uses Gemini 3 Pro Image (primary) with Imagen 4 Fast fallback.
 *
 * Key innovation: 3 prompt categories (Food / Service / Retail)
 * Food: food stays warm-lit, accent color ONLY in environment
 * Service: accent color everywhere
 * Retail: accent in products + environment
 *
 * Templates stored RAW (no gradient). Gradient applied at runtime.
 */

import { GoogleGenAI } from '@google/genai'
import { createServiceClient } from '@/lib/supabase/server'
import { INDUSTRIES } from '@/data/industries-seed'
import {
  ACCENT_FAMILIES,
  INDUSTRY_PROMPT_CATEGORY,
  getAccentFamilyDef,
  type AccentFamily,
  type PromptCategory,
} from './strip'

const STRIP_WIDTH = 1125
const STRIP_HEIGHT = 432

// ─── Per-Industry Subject Descriptions ──────────────────────────

const INDUSTRY_SUBJECTS: Record<string, string> = {
  doener: 'Turkish döner kebab, glistening golden-brown meat on vertical spit, fresh pita bread, steam rising, authentic Mediterranean tavern',
  barber: 'Classic barbershop, vintage straight razor resting on dark leather, brass fixtures, steamy mirror, masculine grooming atmosphere',
  cafe: 'Artisan latte art in ceramic cup, coffee beans scattered on dark wood surface, steam curling upward, cozy coffeehouse',
  pizzeria: 'Wood-fired pizza oven with visible flame glow, bubbling Margherita pizza, rustic brick interior, Italian kitchen',
  baeckerei: 'Fresh golden sourdough loaves, flour-dusted dark wood surface, artisan pastries and croissants, traditional bakery',
  restaurant: 'Fine dining plate with elegant plating on dark ceramic, candlelight, wine glass stem, sophisticated culinary setting',
  shisha: 'Ornate hookah with flowing smoke wisps, brass detailing, velvet cushion, luxurious Middle Eastern lounge atmosphere',
  nagelstudio: 'Elegant manicure setup, lacquer bottles in row, soft lighting reflecting on marble surface, beauty salon',
  kosmetik: 'Luxury skincare products arranged on marble vanity, golden serum dropper, soft diffused lighting, beauty studio',
  fitnessstudio: 'Heavy chrome weights, sweat droplets on metal surface, dramatic sidelighting on gym equipment, athletic atmosphere',
  waschanlage: 'Water spray effects cascading over gleaming car surface, foam patterns, blue-tinted modern car wash facility',
  eisdiele: 'Colorful gelato scoops in artisan display case, waffle cone with sprinkles, bright cheerful Italian gelateria',
  sushi: 'Fresh nigiri on dark slate board, chopsticks resting on bamboo mat, wasabi dot, minimalist Japanese presentation',
  burger: 'Juicy smash burger with melting cheese pull, sesame bun, on dark wooden board, dramatic food photography',
  blumenladen: 'Fresh flower bouquet arrangement, colorful blooms mixed with green foliage, natural daylight, romantic floral shop',
  imbiss: 'Crispy currywurst with golden fries and sauce drizzle, street food atmosphere, casual German Imbiss setting',
  tattoo: 'Tattoo machine close-up with ink bottles lined up, dark industrial workspace, creative artistic atmosphere',
  yogastudio: 'Serene zen yoga space, yoga mat on light wood floor, natural light rays streaming through window, minimalist peaceful',
  tierhandlung: 'Warm pet shop interior, cute animals, natural wood display shelving, welcoming atmosphere with warm lighting',
  reinigung: 'Crisp clean garments on hangers in row, pristine white shirts, organized modern dry cleaning facility',
}

// ─── Prompt Category Rules ──────────────────────────────────────

const CATEGORY_ACCENT_RULES: Record<PromptCategory, (accentHex: string, accentHint: string) => string> = {
  food: (hex, hint) => `CRITICAL LIGHTING RULE:
- The FOOD and PRODUCT must be lit with warm, appetizing lighting (2700K-3000K equivalent).
- Keep food colors natural: golden-brown, rich, vibrant, appetizing.
- The accent color ${hex} appears ONLY in the ENVIRONMENT:
  background neon signs, wall accent lighting, colored ambient glow,
  decorative surfaces, atmospheric light effects.
- NEVER apply ${hex} directly onto the food itself.
- The ${hint} mood should come from environmental lighting, NOT food tinting.`,

  service: (hex, hint) => `ACCENT COLOR RULE:
- IMPORTANT: Incorporate ${hex} throughout the entire scene.
- Apply it to: lighting, surfaces, tools, equipment, ambient glow, and accent highlights.
- The ${hint} atmosphere should define the overall mood.
- Make the accent color prominently visible in the scene.`,

  retail: (hex, hint) => `ACCENT COLOR RULE:
- The accent color ${hex} should be visible in products, decorations,
  natural elements, and environmental lighting.
- Let the ${hint} enhance the natural beauty of the scene.
- Integrate the color naturally rather than artificially.`,
}

const NEUTRAL_ACCENT_RULE = `LIGHTING RULE:
- Dark, moody, cinematic lighting. No specific color accent.
- Sophisticated monochrome atmosphere with deep shadows.
- Think: premium black-and-white photography with subtle warm highlights.`

// ─── Generic (Abstract) Subject ─────────────────────────────────

const GENERIC_SUBJECT = 'Abstract premium atmospheric scene — bokeh lights, dramatic shadows, luxury textures, subtle light gradients, no specific objects or food'

// ─── Prompt Builders ────────────────────────────────────────────

/**
 * Build the full prompt for a given industry + accent family.
 * Applies food-safe rules for food industries.
 */
export function buildStripPrompt(industrySlug: string, accentFamily: AccentFamily): string {
  const isGeneric = industrySlug === 'generic'
  const subject = isGeneric
    ? GENERIC_SUBJECT
    : (INDUSTRY_SUBJECTS[industrySlug] || `Professional ${industrySlug} business scene, atmospheric lighting, commercial photography`)

  const family = getAccentFamilyDef(accentFamily)
  const category = isGeneric ? 'retail' : (INDUSTRY_PROMPT_CATEGORY[industrySlug] || 'service')

  // Neutral family gets special treatment — no accent color
  const accentRule = accentFamily === 'neutral'
    ? NEUTRAL_ACCENT_RULE
    : CATEGORY_ACCENT_RULES[category](family.representative, family.aiHint)

  return `Wide header image for a premium loyalty card.
SUBJECT: ${subject}
${accentFamily !== 'neutral' ? `ACCENT COLOR: ${family.representative}` : ''}

COMPOSITION:
- Wide cinematic framing (16:9).
- Place the main subject on the RIGHT SIDE of the frame (left side will be overlaid with a color gradient).
- Dark/moody overall tone. Deep shadows, dramatic contrast.
- 2025 dark & moody aesthetic: chiaroscuro lighting, matte textures, premium feel.
- ${accentRule}
- NO TEXT. NO LOGOS. NO PEOPLE'S FACES. NO WATERMARKS.
- Professional commercial photography quality, 8K ultra detailed.

A dramatic, commercial-grade shot of ${isGeneric ? 'abstract atmospheric elements' : subject.split(',')[0]}.
Subject clearly visible on the right side of the frame.${accentFamily !== 'neutral' ? `\nThe ${family.aiHint} atmosphere defines the mood.` : ''}`
}

// ─── Image Generation ───────────────────────────────────────────

/**
 * Generate a strip image using Gemini Image Generation API.
 * Returns the RAW image (no gradient) as a PNG buffer at 1125x432.
 */
export async function generateStripImage(
  industrySlug: string,
  accentFamily: AccentFamily,
): Promise<{ buffer: Buffer; prompt: string }> {
  const prompt = buildStripPrompt(industrySlug, accentFamily)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const ai = new GoogleGenAI({ apiKey })
  let rawBase64: string | null = null

  // Primary: Gemini 3 Pro Image
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
      rawBase64 = part.inlineData.data
    }
  } catch (err) {
    console.log(`[Strip Gen] Gemini 3 Pro failed: ${err instanceof Error ? err.message : err}`)
  }

  // Fallback: Imagen 4 Fast
  if (!rawBase64) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: '16:9',
              personGeneration: 'DONT_ALLOW',
              safetyFilterLevel: 'BLOCK_ONLY_HIGH',
            },
          }),
        }
      )
      if (!response.ok) throw new Error(`Imagen ${response.status}`)
      const result = await response.json()
      if (result.predictions?.[0]?.bytesBase64Encoded) {
        rawBase64 = result.predictions[0].bytesBase64Encoded
      }
    } catch (err) {
      console.log(`[Strip Gen] Imagen 4 also failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  if (!rawBase64) throw new Error('All image generation models failed')

  // Post-process: crop to 1125x432, right-aligned
  const rawBuffer = Buffer.from(rawBase64, 'base64')
  const buffer = await cropStripRightAligned(rawBuffer)

  return { buffer, prompt }
}

/**
 * Crop AI-generated image to 1125x432, keeping the right side visible.
 */
async function cropStripRightAligned(rawBuffer: Buffer): Promise<Buffer> {
  const { createCanvas, loadImage } = await import('canvas')

  const canvas = createCanvas(STRIP_WIDTH, STRIP_HEIGHT)
  const ctx = canvas.getContext('2d')
  const img = await loadImage(rawBuffer)

  const scale = Math.max(STRIP_WIDTH / img.width, STRIP_HEIGHT / img.height)
  const scaledWidth = img.width * scale
  const scaledHeight = img.height * scale

  // Right-align: push image left so right-side content stays visible
  const offsetX = STRIP_WIDTH - scaledWidth
  const offsetY = (STRIP_HEIGHT - scaledHeight) / 2

  ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight)

  return canvas.toBuffer('image/png')
}

// ─── Gradient Fade (applied at runtime) ─────────────────────────

/**
 * Apply gradient fade overlay to a strip image.
 * Called at runtime when the lead's actual backgroundColor is known.
 *
 * Gradient: solid bg on left → transparent on right (matches Passify).
 * Stops: 0-20% opaque → 85-100% transparent.
 */
export async function applyStripGradient(
  stripBuffer: Buffer,
  backgroundColor: string,
): Promise<Buffer> {
  const { createCanvas, loadImage } = await import('canvas')

  const canvas = createCanvas(STRIP_WIDTH, STRIP_HEIGHT)
  const ctx = canvas.getContext('2d')

  const img = await loadImage(stripBuffer)
  ctx.drawImage(img, 0, 0, STRIP_WIDTH, STRIP_HEIGHT)

  const rgb = hexToRgb(backgroundColor)
  const gradient = ctx.createLinearGradient(0, 0, STRIP_WIDTH, 0)
  gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`)
  gradient.addColorStop(0.2, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`)
  gradient.addColorStop(0.85, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`)
  gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT)

  return canvas.toBuffer('image/png')
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

// ─── Template Storage ───────────────────────────────────────────

/**
 * Generate a strip template and save to Supabase Storage + DB.
 * Template is stored RAW (no gradient) for maximum reusability.
 */
export async function generateAndSaveTemplate(
  industrySlug: string,
  accentFamily: AccentFamily,
): Promise<{ imageUrl: string; storagePath: string; prompt: string }> {
  const { buffer, prompt } = await generateStripImage(industrySlug, accentFamily)

  const supabase = createServiceClient()
  const storagePath = `${industrySlug}/${accentFamily}.png`

  const { error: uploadError } = await supabase.storage
    .from('strip-templates')
    .upload(storagePath, buffer, { contentType: 'image/png', upsert: true })

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

  const { data: publicUrl } = supabase.storage
    .from('strip-templates')
    .getPublicUrl(storagePath)

  const industryName = industrySlug === 'generic'
    ? 'Generic'
    : (INDUSTRIES.find(i => i.slug === industrySlug)?.name || industrySlug)

  await supabase
    .from('strip_templates')
    .upsert({
      industry: industryName,
      industry_slug: industrySlug,
      accent_family: accentFamily,
      image_url: publicUrl.publicUrl,
      storage_path: storagePath,
      prompt_used: prompt,
    }, { onConflict: 'industry_slug,accent_family' })

  return { imageUrl: publicUrl.publicUrl, storagePath, prompt }
}

/**
 * Generate all templates for ALL industries.
 * Supports filtering by industry and family, and skipping existing.
 */
export async function generateAllTemplates(options?: {
  skipExisting?: boolean
  industries?: string[]
  families?: AccentFamily[]
  onProgress?: (current: number, total: number, industry: string, family: string) => void
}): Promise<{ generated: number; skipped: number; failed: number; errors: string[] }> {
  const { skipExisting = true, onProgress } = options || {}
  const families: AccentFamily[] = options?.families || ['warm', 'red', 'cool', 'green', 'pink', 'purple', 'neutral']
  const allIndustries = options?.industries || [...INDUSTRIES.map(i => i.slug), 'generic']

  // Load existing templates to skip
  let existingKeys = new Set<string>()
  if (skipExisting) {
    const supabase = createServiceClient()
    const { data } = await supabase.from('strip_templates').select('industry_slug, accent_family')
    if (data) {
      existingKeys = new Set(data.map((t: { industry_slug: string; accent_family: string }) => `${t.industry_slug}/${t.accent_family}`))
    }
  }

  const total = allIndustries.length * families.length
  let current = 0
  let generated = 0
  let skipped = 0
  let failed = 0
  const errors: string[] = []

  for (const industrySlug of allIndustries) {
    for (const family of families) {
      current++
      const key = `${industrySlug}/${family}`

      if (existingKeys.has(key)) {
        skipped++
        onProgress?.(current, total, industrySlug, family)
        continue
      }

      onProgress?.(current, total, industrySlug, family)

      try {
        await generateAndSaveTemplate(industrySlug, family)
        generated++
        console.log(`[Strip Gen] ✓ ${key} (${current}/${total})`)
      } catch (err) {
        failed++
        const msg = `${key}: ${err instanceof Error ? err.message : 'Unknown error'}`
        errors.push(msg)
        console.error(`[Strip Gen] ✗ ${msg}`)
      }

      // Rate limit
      if (current < total) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
  }

  return { generated, skipped, failed, errors }
}
