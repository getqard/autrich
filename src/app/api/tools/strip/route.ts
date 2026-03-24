import { NextRequest, NextResponse } from 'next/server'
import {
  matchStripTemplate, getIndustryTemplates, detectAccentFamily,
  getAllTemplates, ACCENT_FAMILIES,
} from '@/lib/wallet/strip'
import {
  generateAndSaveTemplate, generateAllTemplates,
  applyStripGradient, buildStripPrompt,
} from '@/lib/wallet/strip-generator'
import type { AccentFamily } from '@/lib/supabase/types'

const VALID_FAMILIES: AccentFamily[] = ['warm', 'red', 'cool', 'green', 'pink', 'purple', 'neutral']

/**
 * POST /api/tools/strip
 *
 * Actions:
 *   - match: Find best template for industry + accent color (4-tier fallback)
 *   - preview: Match + apply gradient fade → base64 preview
 *   - generate: Generate a single template (industry + accent_family)
 *   - generate-industry: Generate all 7 families for one industry
 *   - generate-all: Generate all 147 templates
 *   - list: List all templates for an industry
 *   - list-all: List all templates grouped by industry
 *   - prompt-preview: Show what prompt would be generated (no AI call)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action = 'match', industry_slug, accent_family, accent_color, bg_color } = body

    switch (action) {
      case 'match': {
        if (!industry_slug) {
          return NextResponse.json({ error: 'industry_slug erforderlich' }, { status: 400 })
        }

        const match = await matchStripTemplate(industry_slug, accent_color || null)
        const detectedFamily = accent_color ? detectAccentFamily(accent_color) : 'neutral'
        const templates = await getIndustryTemplates(industry_slug)

        return NextResponse.json({
          match: match ? {
            accentFamily: match.accentFamily,
            tier: match.tier,
            imageUrl: match.imageUrl,
            templateId: match.template.id,
          } : null,
          detectedFamily,
          familyInfo: ACCENT_FAMILIES.find(f => f.name === detectedFamily),
          templates: templates.map(t => ({
            id: t.id,
            accentFamily: t.accent_family,
            imageUrl: t.image_url,
            storagePath: t.storage_path,
          })),
          totalTemplates: templates.length,
        })
      }

      case 'preview': {
        if (!industry_slug) {
          return NextResponse.json({ error: 'industry_slug erforderlich' }, { status: 400 })
        }

        const previewMatch = await matchStripTemplate(industry_slug, accent_color || null)
        if (!previewMatch) {
          return NextResponse.json({ match: null, error: 'Kein Template gefunden' })
        }

        // Fetch raw template
        const templateRes = await fetch(previewMatch.imageUrl)
        if (!templateRes.ok) {
          return NextResponse.json({ error: 'Template-Bild konnte nicht geladen werden' }, { status: 500 })
        }
        const rawBuffer = Buffer.from(await templateRes.arrayBuffer())

        // Apply gradient with bg_color (or a default dark color)
        const gradientColor = bg_color || '#1a1a2e'
        const withGradient = await applyStripGradient(rawBuffer, gradientColor)

        return NextResponse.json({
          match: {
            accentFamily: previewMatch.accentFamily,
            tier: previewMatch.tier,
          },
          rawImageUrl: previewMatch.imageUrl,
          previewBase64: withGradient.toString('base64'),
          previewSize: withGradient.length,
          bgColorUsed: gradientColor,
        })
      }

      case 'generate': {
        if (!industry_slug || !accent_family) {
          return NextResponse.json({ error: 'industry_slug und accent_family erforderlich' }, { status: 400 })
        }
        if (!VALID_FAMILIES.includes(accent_family)) {
          return NextResponse.json({ error: `accent_family muss ${VALID_FAMILIES.join(', ')} sein` }, { status: 400 })
        }

        const result = await generateAndSaveTemplate(industry_slug, accent_family)
        return NextResponse.json({
          success: true,
          imageUrl: result.imageUrl,
          storagePath: result.storagePath,
          prompt: result.prompt,
        })
      }

      case 'generate-industry': {
        if (!industry_slug) {
          return NextResponse.json({ error: 'industry_slug erforderlich' }, { status: 400 })
        }

        const result = await generateAllTemplates({
          industries: [industry_slug],
          skipExisting: false,
        })

        return NextResponse.json({
          success: true,
          industry: industry_slug,
          generated: result.generated,
          failed: result.failed,
          errors: result.errors,
        })
      }

      case 'generate-all': {
        const result = await generateAllTemplates({ skipExisting: true })
        return NextResponse.json({
          success: true,
          generated: result.generated,
          skipped: result.skipped,
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
            accentFamily: t.accent_family,
            imageUrl: t.image_url,
            storagePath: t.storage_path,
            prompt: t.prompt_used,
          })),
        })
      }

      case 'list-all': {
        const grouped = await getAllTemplates()
        const result: Record<string, Array<{ id: string; accentFamily: string; imageUrl: string }>> = {}

        for (const [industry, templates] of grouped) {
          result[industry] = templates.map(t => ({
            id: t.id,
            accentFamily: t.accent_family,
            imageUrl: t.image_url,
          }))
        }

        return NextResponse.json({
          industries: Object.keys(result).length,
          totalTemplates: Array.from(grouped.values()).reduce((sum, t) => sum + t.length, 0),
          templates: result,
        })
      }

      case 'prompt-preview': {
        if (!industry_slug || !accent_family) {
          return NextResponse.json({ error: 'industry_slug und accent_family erforderlich' }, { status: 400 })
        }

        const prompt = buildStripPrompt(industry_slug, accent_family)
        return NextResponse.json({ prompt, industry: industry_slug, accentFamily: accent_family })
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
