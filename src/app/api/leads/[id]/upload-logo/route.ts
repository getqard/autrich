import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/leads/[id]/upload-logo
 *
 * Nimmt multipart/form-data mit einem File 'logo' an, lädt es nach Supabase Storage
 * (Bucket 'scrape-cache', Pfad 'lead-logos/<leadId>-manual.<ext>') und setzt
 * die resultierende Public-URL als lead.logo_url + logo_source='website' (manuell).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const formData = await request.formData()
  const file = formData.get('logo')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Kein File im Feld "logo"' }, { status: 400 })
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Logo zu groß (max 5 MB)' }, { status: 413 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Nur Bild-Dateien erlaubt' }, { status: 415 })
  }

  const ext = (() => {
    const byName = file.name.split('.').pop()?.toLowerCase()
    if (byName && byName.length <= 4) return byName
    if (file.type === 'image/png') return 'png'
    if (file.type === 'image/jpeg') return 'jpg'
    if (file.type === 'image/webp') return 'webp'
    if (file.type === 'image/svg+xml') return 'svg'
    return 'png'
  })()

  const path = `lead-logos/${id}-manual.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await supabase.storage
    .from('scrape-cache')
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (upErr) {
    return NextResponse.json({ error: `Upload fehlgeschlagen: ${upErr.message}` }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from('scrape-cache').getPublicUrl(path)
  const publicUrl = urlData.publicUrl + `?t=${Date.now()}` // Cache-Bust

  const { error: updateErr } = await supabase.from('leads').update({
    logo_url: urlData.publicUrl,
    logo_source: 'website',
  }).eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: `Lead-Update fehlgeschlagen: ${updateErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, logo_url: publicUrl })
}
