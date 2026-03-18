import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { parseCSV } from '@/lib/utils/csv-parser'
import { validateEmailFormat } from '@/lib/utils/validate-email'
import { generateSlug, makeSlugUnique } from '@/lib/utils/slug'

// POST /api/campaigns/[id]/upload — Upload CSV + validate + create leads
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 })
  }

  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'Datei konnte nicht gelesen werden' }, { status: 400 })
  }

  let parsed
  try {
    parsed = parseCSV(buffer)
  } catch (e) {
    return NextResponse.json({
      error: `Datei konnte nicht geparst werden: ${e instanceof Error ? e.message : 'Unbekannter Fehler'}`,
    }, { status: 400 })
  }

  if (parsed.errors.length > 0 && parsed.rows.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'Keine validen Zeilen gefunden',
      summary: {
        total_rows: parsed.totalRows,
        valid: 0,
        invalid: parsed.errors.length,
        duplicates: 0,
        blacklisted: 0,
        parse_errors: parsed.errors.length,
      },
      validation_errors: [],
      duplicates: [],
      blacklisted: [],
      parse_errors: parsed.errors,
      detected_headers: parsed.headers,
    }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Check campaign exists
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: 'Kampagne nicht gefunden' }, { status: 404 })
  }

  // Check for blacklisted emails
  const emails = parsed.rows.map(r => r.email.toLowerCase())
  const { data: blacklisted } = await supabase
    .from('blacklist')
    .select('email')
    .in('email', emails)

  const blacklistedSet = new Set(blacklisted?.map(b => b.email) || [])

  // Check for duplicates in active campaigns
  const { data: existingLeads } = await supabase
    .from('leads')
    .select('email')
    .in('email', emails)

  const existingSet = new Set(existingLeads?.map(l => l.email) || [])

  // Get existing slugs
  const { data: existingSlugs } = await supabase
    .from('leads')
    .select('download_page_slug')
    .not('download_page_slug', 'is', null)

  const slugSet = new Set(existingSlugs?.map(s => s.download_page_slug!) || [])

  // Validate and prepare leads
  const validLeads: Array<{
    campaign_id: string
    source: 'csv'
    business_name: string
    email: string
    website_url: string | null
    industry: string | null
    phone: string | null
    city: string | null
    address: string | null
    contact_name: string | null
    instagram_handle: string | null
    download_page_slug: string
  }> = []

  const validationErrors: Array<{ row: number; email: string; message: string }> = []
  const duplicates: Array<{ row: number; email: string; message: string }> = []
  const blacklistedRows: Array<{ row: number; email: string }> = []
  const seenEmails = new Set<string>()

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i]
    const rowNum = i + 2 // 1-based + header row
    const emailLower = row.email.toLowerCase()

    // Email format check
    const emailCheck = validateEmailFormat(row.email)
    if (!emailCheck.valid) {
      validationErrors.push({ row: rowNum, email: row.email, message: emailCheck.error! })
      continue
    }

    // Blacklist check
    if (blacklistedSet.has(emailLower)) {
      blacklistedRows.push({ row: rowNum, email: emailLower })
      continue
    }

    // Duplicate in DB
    if (existingSet.has(emailLower)) {
      duplicates.push({ row: rowNum, email: emailLower, message: 'Bereits in einer Kampagne' })
      continue
    }

    // Duplicate in same file
    if (seenEmails.has(emailLower)) {
      duplicates.push({ row: rowNum, email: emailLower, message: 'Doppelt in dieser Datei' })
      continue
    }

    seenEmails.add(emailLower)

    const slug = makeSlugUnique(
      generateSlug(row.business_name, row.city),
      slugSet
    )
    slugSet.add(slug)

    validLeads.push({
      campaign_id: campaignId,
      source: 'csv' as const,
      business_name: row.business_name,
      email: emailLower,
      website_url: row.website_url || null,
      industry: row.industry || null,
      phone: row.phone || null,
      city: row.city || null,
      address: row.address || null,
      contact_name: row.contact_name || null,
      instagram_handle: row.instagram_handle || null,
      download_page_slug: slug,
    })
  }

  // Insert valid leads in batches of 500
  let insertedCount = 0
  const BATCH_SIZE = 500

  for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
    const batch = validLeads.slice(i, i + BATCH_SIZE)
    const { error: insertError } = await supabase
      .from('leads')
      .insert(batch)

    if (insertError) {
      return NextResponse.json({
        error: `Insert fehlgeschlagen bei Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertError.message}`,
        inserted_so_far: insertedCount,
      }, { status: 500 })
    }

    insertedCount += batch.length
  }

  // Update campaign totals
  await supabase
    .from('campaigns')
    .update({ total_leads: insertedCount })
    .eq('id', campaignId)

  return NextResponse.json({
    success: true,
    summary: {
      total_rows: parsed.totalRows,
      valid: insertedCount,
      invalid: validationErrors.length,
      duplicates: duplicates.length,
      blacklisted: blacklistedRows.length,
      parse_errors: parsed.errors.length,
    },
    validation_errors: validationErrors,
    duplicates,
    blacklisted: blacklistedRows,
    parse_errors: parsed.errors,
    detected_headers: parsed.headers,
  })
}
