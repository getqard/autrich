import { NextRequest, NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'
import QRCode from 'qrcode'
import sharp from 'sharp'
import { createServiceClient } from '@/lib/supabase/server'
import { buildMockupJsx, type MockupInput } from '@/components/mockup/AppleWalletMockup'
import type { Lead } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/leads/[id]/mockup
 *
 * Rendert Apple-Wallet-Mockup als PNG für einen Lead.
 * - Cached in Supabase Storage (`scrape-cache/mockups/{lead-id}.png`)
 * - Aktualisiert `leads.mockup_png_url`
 * - Query-Params:
 *     ?force=1   → Cache invalidieren und neu rendern
 *     ?inline=1  → PNG direkt als Response-Body (für Debugging), nicht via Storage
 *
 * Response: { url: string, size_kb: number, cached: boolean }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const url = new URL(request.url)
  const force = url.searchParams.get('force') === '1'
  const inline = url.searchParams.get('inline') === '1'

  const { data: leadData, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !leadData) {
    return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 })
  }

  const lead = leadData as Lead

  // Cache-Hit (nicht wenn force oder inline)
  if (!force && !inline && lead.mockup_png_url) {
    return NextResponse.json({ url: lead.mockup_png_url, cached: true })
  }

  // ── QR-Code generieren (Demo-URL zur Download-Page) ──
  const downloadBase = process.env.NEXT_PUBLIC_DOWNLOAD_BASE_URL || 'https://deine-treuekarte.de'
  const qrPayload = lead.download_page_slug
    ? `${downloadBase}/d/${lead.download_page_slug}`
    : `${downloadBase}`
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 240,
    color: { dark: '#000000', light: '#FFFFFF' },
  })

  // ── Logo als Base64 (Satori kann HTTPS-URLs nutzen, base64 ist aber zuverlässiger) ──
  const logoBase64 = lead.logo_url ? await fetchAsDataUrl(lead.logo_url) : null
  const stripBase64 = lead.strip_image_url ? await fetchAsDataUrl(lead.strip_image_url) : null

  const mockupInput: MockupInput = {
    business_name: lead.business_name,
    logo_url: lead.logo_url,
    logo_base64: logoBase64,
    strip_image_url: lead.strip_image_url,
    strip_image_base64: stripBase64,
    dominant_color: lead.dominant_color || '#0a0a0a',
    text_color: lead.text_color || '#ffffff',
    label_color: lead.label_color || '#9ca3af',
    detected_reward: lead.detected_reward,
    detected_reward_emoji: lead.detected_reward_emoji,
    detected_stamp_emoji: lead.detected_stamp_emoji,
    detected_max_stamps: lead.detected_max_stamps,
    detected_pass_title: lead.detected_pass_title || 'Treuekarte',
    qr_data_url: qrDataUrl,
    filled_stamps: 2,
  }

  // ── Render via next/og ImageResponse ──
  const jsx = buildMockupJsx(mockupInput)
  const response = new ImageResponse(jsx, {
    width: 600,
    height: 1200,
  })

  const pngBuffer = Buffer.from(await response.arrayBuffer())

  // ── Kompression via sharp: PNG → optimiertes PNG, Fallback JPEG wenn >150 KB ──
  let finalBuffer = await sharp(pngBuffer)
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true })
    .toBuffer()
  let contentType = 'image/png'
  let ext = 'png'

  if (finalBuffer.length > 150 * 1024) {
    // Fallback JPEG für kleinere Dateigröße
    finalBuffer = await sharp(pngBuffer)
      .flatten({ background: '#e5e7eb' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
    contentType = 'image/jpeg'
    ext = 'jpg'
  }

  // Inline-Response für Debugging
  if (inline) {
    return new Response(finalBuffer as BodyInit, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
    })
  }

  // Upload zu Supabase Storage
  const path = `mockups/${id}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('scrape-cache')
    .upload(path, finalBuffer, { contentType, upsert: true })

  if (upErr) {
    return NextResponse.json({ error: `Upload: ${upErr.message}` }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from('scrape-cache').getPublicUrl(path)
  const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`

  await supabase.from('leads').update({ mockup_png_url: publicUrl }).eq('id', id)

  return NextResponse.json({
    url: publicUrl,
    size_kb: Math.round(finalBuffer.length / 1024),
    content_type: contentType,
    cached: false,
  })
}

/**
 * Lädt ein Bild über HTTPS und gibt es als data:-URL zurück.
 * Satori kann mit HTTPS-URLs umgehen, aber base64 umgeht Flaky-Network/CORS-Probleme.
 */
async function fetchAsDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0 Autrich-Mockup' } })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/png'
    const buffer = Buffer.from(await res.arrayBuffer())
    // Konvertiere SVG zu PNG (Satori rendert SVG nicht immer sauber)
    if (contentType.includes('svg')) {
      const png = await sharp(buffer).resize(400, 400, { fit: 'inside' }).png().toBuffer()
      return `data:image/png;base64,${png.toString('base64')}`
    }
    // Bilder größer 500 KB → runterskalieren
    if (buffer.length > 500 * 1024) {
      const resized = await sharp(buffer).resize(400, 400, { fit: 'inside' }).png().toBuffer()
      return `data:image/png;base64,${resized.toString('base64')}`
    }
    return `data:${contentType};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}
