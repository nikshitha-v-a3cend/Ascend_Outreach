// src/app/api/campaigns/[id]/activity/route.ts
import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const { searchParams } = req.nextUrl
  const limit = parseInt(searchParams.get('limit') ?? '50')

  const db = getServerSupabase()

  const { data: logs, error } = await db
    .from('campaign_logs')
    .select(`
      *,
      contact:contacts(id, first_name, last_name, company)
    `)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ activity: logs })
}
