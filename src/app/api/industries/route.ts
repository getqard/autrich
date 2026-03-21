import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/industries — List all industries
export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('industries')
    .select('*')
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST /api/industries — Create new industry
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { slug, name, search_terms, emoji, default_reward, default_stamp_emoji, default_max_stamps } = body

  if (!slug || !name) {
    return NextResponse.json({ error: 'slug und name sind erforderlich' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('industries')
    .insert({
      slug,
      name,
      search_terms: search_terms || [],
      emoji: emoji || null,
      default_reward: default_reward || null,
      default_stamp_emoji: default_stamp_emoji || null,
      default_max_stamps: default_max_stamps || 10,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
