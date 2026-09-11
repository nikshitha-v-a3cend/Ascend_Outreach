// src/app/api/campaigns/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerSupabase } from '@/lib/supabase/server'

const CreateCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  from_name: z.string().min(1, 'From name is required'),
  from_email: z.string().email('Valid from email is required'),
  initial_template_id: z.string().optional(),
  no_open_template_id: z.string().optional(),
  opened_no_reply_template_id: z.string().optional(),
  follow_up_delay_minutes: z.number().int().min(5).default(2880),
  test_mode: z.boolean().default(true),
})

export async function GET() {
  try {
    const db = getServerSupabase()
    const { data: campaigns, error } = await db
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    // Get contact counts per campaign
    const campaignIds = campaigns?.map((c) => c.id) ?? []
    const statsMap: Record<string, Record<string, number>> = {}

    if (campaignIds.length > 0) {
      const { data: ccData } = await db
        .from('campaign_contacts')
        .select('campaign_id, status, opened, replied, bounced, unsubscribed, follow_up_sent_at')
        .in('campaign_id', campaignIds)

      for (const cc of ccData ?? []) {
        if (!statsMap[cc.campaign_id]) {
          statsMap[cc.campaign_id] = {
            total: 0, sent: 0, opened: 0, replied: 0, bounced: 0, unsubscribed: 0, follow_ups: 0,
          }
        }
        statsMap[cc.campaign_id].total++
        if (['sent', 'opened', 'follow_up_sent', 'replied'].includes(cc.status)) statsMap[cc.campaign_id].sent++
        if (cc.opened) statsMap[cc.campaign_id].opened++
        if (cc.replied) statsMap[cc.campaign_id].replied++
        if (cc.bounced) statsMap[cc.campaign_id].bounced++
        if (cc.unsubscribed) statsMap[cc.campaign_id].unsubscribed++
        if (cc.follow_up_sent_at) statsMap[cc.campaign_id].follow_ups++
      }
    }

    const enriched = (campaigns ?? []).map((c) => ({
      ...c,
      stats: statsMap[c.id] ?? { total: 0, sent: 0, opened: 0, replied: 0, bounced: 0, unsubscribed: 0, follow_ups: 0 },
    }))

    return Response.json({ campaigns: enriched })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch campaigns' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateCampaignSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const db = getServerSupabase()
    const { data, error } = await db
      .from('campaigns')
      .insert({
        name: parsed.data.name,
        from_name: parsed.data.from_name,
        from_email: parsed.data.from_email,
        initial_template_id: parsed.data.initial_template_id || null,
        no_open_template_id: parsed.data.no_open_template_id || null,
        opened_no_reply_template_id: parsed.data.opened_no_reply_template_id || null,
        follow_up_delay_minutes: parsed.data.follow_up_delay_minutes,
        test_mode: parsed.data.test_mode,
        status: 'draft',
      })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    console.log('[Campaign] Created:', { campaign_id: data.id, name: data.name, test_mode: data.test_mode })

    return Response.json({ campaign: data }, { status: 201 })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to create campaign' },
      { status: 500 }
    )
  }
}
