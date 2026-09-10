// src/app/api/campaigns/[id]/pause/route.ts
import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const db = getServerSupabase()

  const { data: campaign } = await db.from('campaigns').select('status').eq('id', campaignId).single()
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status !== 'active') return Response.json({ error: 'Campaign is not active' }, { status: 400 })

  await db.from('campaigns').update({ status: 'paused' }).eq('id', campaignId)
  await db.from('campaign_logs').insert({ campaign_id: campaignId, level: 'info', message: 'Campaign paused' })

  return Response.json({ success: true, status: 'paused' })
}
