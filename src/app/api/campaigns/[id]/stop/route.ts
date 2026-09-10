// src/app/api/campaigns/[id]/stop/route.ts
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

  // Stop campaign and all queued contacts
  await db.from('campaigns').update({ status: 'stopped' }).eq('id', campaignId)

  // Mark all queued/sending contacts as stopped
  await db
    .from('campaign_contacts')
    .update({ stopped: true, status: 'stopped' })
    .eq('campaign_id', campaignId)
    .in('status', ['queued', 'sending', 'sent'])

  await db.from('campaign_logs').insert({
    campaign_id: campaignId,
    level: 'info',
    message: 'Campaign stopped — all pending follow-ups cancelled',
  })

  return Response.json({ success: true, status: 'stopped' })
}
