import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getFranchiseInfo } from '@/lib/utils/franchise-detection'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('email')
    .eq('id', id)
    .single()

  if (!lead?.email) {
    return NextResponse.json({ isFranchise: false, franchiseCount: 0, isGeneric: false })
  }

  const info = await getFranchiseInfo(lead.email)
  if (!info) {
    return NextResponse.json({ isFranchise: false, franchiseCount: 0, isGeneric: false })
  }

  return NextResponse.json({
    isFranchise: info.isFranchise,
    franchiseCount: info.franchiseCount,
    isGeneric: info.isGeneric,
    isBlacklisted: info.isBlacklisted,
  })
}
