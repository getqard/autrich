import { NextRequest, NextResponse } from 'next/server'
import { generateApplePass, validateAppleConfig } from '@/lib/wallet/apple'
import { generateGoogleSaveLink, validateGoogleConfig } from '@/lib/wallet/google'
import { randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/tools/pass
 *
 * Actions:
 *   - validate-apple: Check Apple cert configuration
 *   - validate-google: Check Google credential configuration
 *   - generate: Generate Apple .pkpass + Google save link from form data
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { action = 'generate' } = body

    switch (action) {
      case 'validate-apple': {
        const result = validateAppleConfig()
        return NextResponse.json(result)
      }

      case 'validate-google': {
        const result = validateGoogleConfig()
        return NextResponse.json(result)
      }

      case 'generate': {
        const {
          business_name,
          pass_title = 'Treuekarte',
          background_color = '#1a1a2e',
          text_color = '#ffffff',
          label_color = '#999999',
          stamp_emoji = '⭐',
          reward = 'Überraschung',
          reward_emoji = '🎉',
          current_stamps = 3,
          max_stamps = 10,
          logo_url,
          strip_image_url,
          address,
          phone,
          website,
          opening_hours,
          lat,
          lng,
          generate_apple = true,
          generate_google = true,
        } = body

        if (!business_name) {
          return NextResponse.json({ error: 'business_name ist erforderlich' }, { status: 400 })
        }

        const serial = randomUUID()
        const authToken = randomUUID()
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://autrich.vercel.app'
        const barcodeUrl = `${baseUrl}/d/demo-${serial.substring(0, 8)}`

        // Fetch logo as buffer
        let logoBuffer: Buffer | null = null
        if (logo_url) {
          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5000)
            const res = await fetch(logo_url, { signal: controller.signal })
            clearTimeout(timeout)
            if (res.ok) {
              logoBuffer = Buffer.from(await res.arrayBuffer())
              if (logoBuffer.length < 100) logoBuffer = null
            }
          } catch { /* use fallback */ }
        }

        // Fetch strip as buffer (optional)
        let stripBuffer: Buffer | null = null
        if (strip_image_url) {
          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5000)
            const res = await fetch(strip_image_url, { signal: controller.signal })
            clearTimeout(timeout)
            if (res.ok) stripBuffer = Buffer.from(await res.arrayBuffer())
          } catch { /* continue without strip */ }
        }

        const commonData = {
          serial,
          authToken,
          businessName: business_name,
          passTitle: pass_title,
          backgroundColor: background_color,
          textColor: text_color,
          labelColor: label_color,
          stampEmoji: stamp_emoji,
          currentStamps: current_stamps,
          maxStamps: max_stamps,
          reward,
          rewardEmoji: reward_emoji,
          barcodeUrl,
          address: address || null,
          phone: phone || null,
          openingHours: opening_hours || null,
          website: website || null,
          lat: lat ? parseFloat(lat) : null,
          lng: lng ? parseFloat(lng) : null,
        }

        const result: Record<string, unknown> = { serial, durationMs: 0 }

        // Apple Pass
        if (generate_apple) {
          try {
            const appleBuffer = await generateApplePass({
              ...commonData,
              logoBuffer,
              stripBuffer,
            })

            // Upload to storage
            const supabase = createServiceClient()
            const storagePath = `${serial}.pkpass`
            await supabase.storage.from('passes').upload(storagePath, appleBuffer, {
              contentType: 'application/vnd.apple.pkpass',
              upsert: true,
            })

            result.apple = {
              serial,
              downloadUrl: `/api/passes/${serial}`,
              storagePath,
              sizeBytes: appleBuffer.length,
            }
          } catch (err) {
            result.apple = { error: err instanceof Error ? err.message : 'Apple pass generation failed' }
          }
        }

        // Google Save Link
        if (generate_google) {
          try {
            const googleResult = generateGoogleSaveLink({
              ...commonData,
              logoPublicUrl: logo_url || null,
              stripPublicUrl: strip_image_url || null,
            })

            result.google = {
              saveUrl: googleResult.url,
            }
          } catch (err) {
            result.google = { error: err instanceof Error ? err.message : 'Google pass generation failed' }
          }
        }

        result.durationMs = Date.now() - startTime
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Pass-Operation fehlgeschlagen' },
      { status: 500 }
    )
  }
}
