import { NextRequest, NextResponse } from 'next/server'
import { matchStripTemplate, getIndustryTemplates, detectColorVariant, getAllTemplates } from '@/lib/wallet/strip'
import { generateAndSaveTemplate, generateAllTemplates } from '@/lib/wallet/strip-generator'
import type { ColorVariantName } from '@/lib/wallet/strip'

/**
 * POST /api/tools/strip
 *
 * Actions:
 *   - match: Find best template for industry + color
 *   - generate: Generate a single template
 *   - generate-all: Generate all 80 templates
 *   - list: List all templates for an industry
 *   - list-all: List all templates grouped by industry
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action = 'match', industry_slug, color_variant, hex_color } = body

    switch (action) {
      case 'match': {
        if (!industry_slug || !hex_color) {
          return NextResponse.json({ error: 'industry_slug und hex_color erforderlich' }, { status: 400 })
        }

        const match = await matchStripTemplate(industry_slug, hex_color)
        const detectedVariant = detectColorVariant(hex_color)
        const templates = await getIndustryTemplates(industry_slug)

        return NextResponse.json({
          match: match ? {
            variant: match.variant,
            distance: Math.round(match.distance),
            imageUrl: match.imageUrl,
            templateId: match.template.id,
          } : null,
          detectedVariant,
          templates: templates.map(t => ({
            id: t.id,
            variant: t.color_variant,
            imageUrl: t.image_url,
            storagePath: t.storage_path,
            hexStart: t.hex_range_start,
            hexEnd: t.hex_range_end,
          })),
          totalTemplates: templates.length,
        })
      }

      case 'generate': {
        if (!industry_slug || !color_variant) {
          return NextResponse.json({ error: 'industry_slug und color_variant erforderlich' }, { status: 400 })
        }

        const validVariants: ColorVariantName[] = ['dark', 'warm', 'earthy', 'vibrant']
        if (!validVariants.includes(color_variant)) {
          return NextResponse.json({ error: `color_variant muss dark, warm, earthy oder vibrant sein` }, { status: 400 })
        }

        const result = await generateAndSaveTemplate(industry_slug, color_variant)

        return NextResponse.json({
          success: true,
          imageUrl: result.imageUrl,
          storagePath: result.storagePath,
          prompt: result.prompt,
        })
      }

      case 'generate-all': {
        const result = await generateAllTemplates()
        return NextResponse.json({
          success: true,
          generated: result.generated,
          failed: result.failed,
          errors: result.errors,
        })
      }

      case 'list': {
        if (!industry_slug) {
          return NextResponse.json({ error: 'industry_slug erforderlich' }, { status: 400 })
        }

        const templates = await getIndustryTemplates(industry_slug)
        return NextResponse.json({
          industry: industry_slug,
          templates: templates.map(t => ({
            id: t.id,
            variant: t.color_variant,
            imageUrl: t.image_url,
            storagePath: t.storage_path,
            hexStart: t.hex_range_start,
            hexEnd: t.hex_range_end,
            prompt: t.prompt_used,
          })),
        })
      }

      case 'list-all': {
        const grouped = await getAllTemplates()
        const result: Record<string, Array<{
          id: string
          variant: string
          imageUrl: string
        }>> = {}

        for (const [industry, templates] of grouped) {
          result[industry] = templates.map(t => ({
            id: t.id,
            variant: t.color_variant,
            imageUrl: t.image_url,
          }))
        }

        return NextResponse.json({
          industries: Object.keys(result).length,
          totalTemplates: Array.from(grouped.values()).reduce((sum, t) => sum + t.length, 0),
          templates: result,
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Strip-Operation fehlgeschlagen' },
      { status: 500 }
    )
  }
}
