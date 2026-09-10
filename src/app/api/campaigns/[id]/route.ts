// src/app/api/campaigns/[id]/route.ts
import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const db = getServerSupabase()
    const { data: campaign, error } = await db
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !campaign) {
      return Response.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Get stats
    const { data: ccData } = await db
      .from('campaign_contacts')
      .select('status, opened, replied, bounced, unsubscribed, stopped, follow_up_sent_at')
      .eq('campaign_id', id)

    const stats = {
      total: ccData?.length ?? 0,
      queued: 0,
      sent: 0,
      opened: 0,
      replied: 0,
      bounced: 0,
      unsubscribed: 0,
      follow_up_sent: 0,
      failed: 0,
      stopped: 0,
    }

    for (const cc of ccData ?? []) {
      if (cc.status === 'queued') stats.queued++
      if (['sent', 'opened', 'no_open', 'follow_up_sent', 'replied'].includes(cc.status)) stats.sent++
      if (cc.opened) stats.opened++
      if (cc.replied) stats.replied++
      if (cc.bounced) stats.bounced++
      if (cc.unsubscribed) stats.unsubscribed++
      if (cc.follow_up_sent_at) stats.follow_up_sent++
      if (cc.status === 'failed') stats.failed++
      if (cc.stopped && !cc.bounced && !cc.unsubscribed && !cc.replied) stats.stopped++
    }

    return Response.json({ campaign, stats })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch campaign' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await req.json()
    const db = getServerSupabase()

    const { data, error } = await db
      .from('campaigns')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ campaign: data })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to update campaign' },
      { status: 500 }
    )
  }
}
