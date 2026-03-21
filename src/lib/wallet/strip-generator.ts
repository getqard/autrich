/**
 * Strip Image Generator — Google Imagen 4.0
 *
 * Generates atmospheric 1125×432 strip images for Apple Wallet passes.
 * Used for:
 *   1. Batch pre-generation of all industry × color variant templates ($2.40 one-time)
 *   2. On-demand fallback when no template matches
 *
 * Each generated image is saved to Supabase Storage and registered in strip_templates.
 */

import { createServiceClient } from '@/lib/supabase/server'
import { INDUSTRIES } from '@/data/industries-seed'
import type { ColorVariantName } from './strip'

// ─── Prompt Templates per Industry ──────────────────────────────

const INDUSTRY_PROMPTS: Record<string, string> = {
  doener: 'Atmospheric Turkish kebab restaurant scene, warm ambient lighting, traditional döner meat on vertical spit, fresh pita bread, authentic Mediterranean atmosphere',
  barber: 'Professional barbershop interior, vintage barber tools, leather chair, warm masculine lighting, classic grooming atmosphere',
  cafe: 'Cozy coffee shop scene, steaming latte art, warm natural lighting, wooden furniture, artisan coffee beans, inviting cafe atmosphere',
  pizzeria: 'Authentic Italian pizzeria, wood-fired pizza oven glow, fresh Margherita pizza, rustic Mediterranean kitchen, warm atmosphere',
  baeckerei: 'Traditional German bakery, fresh golden bread loaves, flour dusted wooden surface, warm oven light, artisan pastries',
  restaurant: 'Elegant restaurant interior, fine dining table setting, warm candlelight ambiance, sophisticated culinary atmosphere',
  shisha: 'Atmospheric shisha lounge, ornate hookah with smoke wisps, warm ambient lighting, luxurious Middle Eastern decor, velvet seating',
  nagelstudio: 'Modern nail salon, elegant manicure setup, soft pink lighting, professional nail art tools, luxurious beauty atmosphere',
  kosmetik: 'Luxury beauty studio, skincare products arrangement, soft golden lighting, marble surfaces, elegant spa atmosphere',
  fitnessstudio: 'Modern gym interior, professional workout equipment, dramatic lighting, motivational athletic atmosphere',
  waschanlage: 'Professional car wash facility, water spray effects, blue neon lighting, gleaming clean car surface, modern automotive care',
  eisdiele: 'Artisan ice cream shop, colorful gelato scoops in display, bright cheerful atmosphere, waffle cones, Italian gelateria style',
  sushi: 'Japanese sushi bar, fresh nigiri on wooden board, elegant minimalist presentation, zen atmosphere, chopsticks on bamboo mat',
  burger: 'Gourmet burger restaurant, juicy burger with melting cheese, dramatic food photography lighting, rustic wooden board',
  blumenladen: 'Beautiful flower shop, fresh colorful bouquets, natural daylight, green foliage, romantic floral arrangement',
  imbiss: 'German street food scene, crispy currywurst with golden fries, warm food truck lighting, casual outdoor atmosphere',
  tattoo: 'Professional tattoo studio, artistic ink designs, dramatic dark lighting, creative industrial interior, tattoo machine closeup',
  yogastudio: 'Serene yoga studio, natural light streaming in, minimalist zen space, yoga mat and meditation cushion, peaceful atmosphere',
  tierhandlung: 'Charming pet shop, cute animals, warm welcoming interior, pet accessories display, natural warm lighting',
  reinigung: 'Professional dry cleaning service, crisp clean garments on hangers, organized laundry, pristine white shirts, modern facility',
}

const VARIANT_STYLE_SUFFIX: Record<ColorVariantName, string> = {
  dark: ', dark moody tones, deep shadows, dramatic low-key lighting, cinematic noir atmosphere',
  warm: ', warm golden tones, amber lighting, cozy inviting warmth, sunset-like glow',
  earthy: ', earthy natural tones, muted brown and green palette, organic rustic feel, vintage warmth',
  vibrant: ', vibrant rich colors, saturated bold tones, energetic dynamic lighting, eye-catching contrast',
}

/**
 * Build the Imagen prompt for a given industry + color variant.
 */
export function buildStripPrompt(industrySlug: string, colorVariant: ColorVariantName): string {
  const base = INDUSTRY_PROMPTS[industrySlug] || `Professional ${industrySlug} business scene, atmospheric lighting, high quality commercial photography`
  const style = VARIANT_STYLE_SUFFIX[colorVariant]
  return `${base}${style}. Horizontal wide banner format, no text, no logos, no people's faces, professional stock photo quality, 8k ultra detailed`
}

/**
 * Generate a strip image using Google Imagen 4.0 API.
 * Returns the image as a PNG buffer.
 */
export async function generateStripImage(
  industrySlug: string,
  colorVariant: ColorVariantName,
): Promise<{ buffer: Buffer; prompt: string }> {
  const prompt = buildStripPrompt(industrySlug, colorVariant)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  // Use Imagen 4.0 via Gemini API
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '16:9', // Closest to 1125×432 (2.6:1)
          personGeneration: 'DONT_ALLOW',
          safetyFilterLevel: 'BLOCK_ONLY_HIGH',
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Imagen API error ${response.status}: ${errorText}`)
  }

  const result = await response.json()
  const prediction = result.predictions?.[0]

  if (!prediction?.bytesBase64Encoded) {
    throw new Error('Imagen API returned no image data')
  }

  const imageBuffer = Buffer.from(prediction.bytesBase64Encoded, 'base64')

  // Resize to exact strip dimensions (1125×432) using sharp
  const sharp = (await import('sharp')).default
  const resized = await sharp(imageBuffer)
    .resize(1125, 432, { fit: 'cover', position: 'center' })
    .png({ compressionLevel: 6 })
    .toBuffer()

  return { buffer: resized, prompt }
}

/**
 * Generate a strip template and save it to storage + DB.
 */
export async function generateAndSaveTemplate(
  industrySlug: string,
  colorVariant: ColorVariantName,
): Promise<{ imageUrl: string; storagePath: string; prompt: string }> {
  const { buffer, prompt } = await generateStripImage(industrySlug, colorVariant)

  const supabase = createServiceClient()
  const storagePath = `${industrySlug}/${colorVariant}.png`

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('strip-templates')
    .upload(storagePath, buffer, {
      contentType: 'image/png',
      upsert: true,
    })

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`)
  }

  const { data: publicUrl } = supabase.storage
    .from('strip-templates')
    .getPublicUrl(storagePath)

  // Get industry defaults for hex range
  const industry = INDUSTRIES.find(i => i.slug === industrySlug)
  const hexStart = getVariantHexStart(colorVariant, industry?.default_color)
  const hexEnd = getVariantHexEnd(colorVariant, industry?.default_color)

  // Upsert into strip_templates
  await supabase
    .from('strip_templates')
    .upsert({
      industry: industrySlug,
      industry_slug: industrySlug,
      color_variant: colorVariant,
      image_url: publicUrl.publicUrl,
      storage_path: storagePath,
      hex_range_start: hexStart,
      hex_range_end: hexEnd,
      prompt_used: prompt,
    }, { onConflict: 'industry_slug,color_variant' })

  return {
    imageUrl: publicUrl.publicUrl,
    storagePath,
    prompt,
  }
}

/**
 * Generate ALL templates for ALL industries (80 total).
 * Returns progress updates via callback.
 */
export async function generateAllTemplates(
  onProgress?: (current: number, total: number, industry: string, variant: string) => void,
): Promise<{ generated: number; failed: number; errors: string[] }> {
  const variants: ColorVariantName[] = ['dark', 'warm', 'earthy', 'vibrant']
  const total = INDUSTRIES.length * variants.length
  let current = 0
  let failed = 0
  const errors: string[] = []

  for (const industry of INDUSTRIES) {
    for (const variant of variants) {
      current++
      onProgress?.(current, total, industry.slug, variant)

      try {
        await generateAndSaveTemplate(industry.slug, variant)
      } catch (err) {
        failed++
        const msg = `${industry.slug}/${variant}: ${err instanceof Error ? err.message : 'Unknown error'}`
        errors.push(msg)
        console.error(`[Strip Generator] Failed:`, msg)
      }

      // Small delay to avoid rate limiting
      if (current < total) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
  }

  return { generated: current - failed, failed, errors }
}

// ─── Helpers ─────────────────────────────────────────────────────

function getVariantHexStart(variant: ColorVariantName, defaultColor?: string): string {
  switch (variant) {
    case 'dark': return '#0a0a15'
    case 'warm': return defaultColor || '#6F4E37'
    case 'earthy': return '#3C2A1E'
    case 'vibrant': return '#8B0000'
    default: return '#0a0a15'
  }
}

function getVariantHexEnd(variant: ColorVariantName, defaultColor?: string): string {
  switch (variant) {
    case 'dark': return '#2d2d3f'
    case 'warm': return defaultColor || '#B8860B'
    case 'earthy': return '#8B7355'
    case 'vibrant': return '#FF4500'
    default: return '#2d2d3f'
  }
}
