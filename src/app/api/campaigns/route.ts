// src/app/api/campaigns/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerSupabase } from '@/lib/supabase/server'
import { DEFAULT_MAX_FOLLOW_UPS, ABSOLUTE_MAX_SEQUENCE_STEPS } from '@/lib/ai/safety'

const CreateCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  from_name: z.string().min(1, 'From name is required'),
  from_email: z.string().email('Valid from email is required'),
  from_title: z.string().optional(),
  initial_template_id: z.string().optional(),
  no_open_template_id: z.string().optional(),
  opened_no_reply_template_id: z.string().optional(),
  follow_up_delay_minutes: z.number().int().min(5).default(2880),
  // Number of follow-up emails after the initial send; null = unlimited
  // (still bounded by the absolute backend safety ceiling).
  max_follow_ups: z.number().int().min(1).max(ABSOLUTE_MAX_SEQUENCE_STEPS - 1).nullable().default(DEFAULT_MAX_FOLLOW_UPS),
  custom_instructions: z.string().optional(),
  messaging_guidelines: z.string().optional(),
  target_tone: z.string().optional(),
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
    const insertPayload = {
      name: parsed.data.name,
      from_name: parsed.data.from_name,
      from_email: parsed.data.from_email,
      from_title: parsed.data.from_title || null,
      initial_template_id: parsed.data.initial_template_id || null,
      no_open_template_id: parsed.data.no_open_template_id || null,
      opened_no_reply_template_id: parsed.data.opened_no_reply_template_id || null,
      follow_up_delay_minutes: parsed.data.follow_up_delay_minutes,
      max_follow_ups: parsed.data.max_follow_ups,
      custom_instructions: parsed.data.custom_instructions || null,
      messaging_guidelines: parsed.data.messaging_guidelines || null,
      target_tone: parsed.data.target_tone || 'Professional & Consultative',
      test_mode: parsed.data.test_mode,
      status: 'draft',
    }

    let { data, error } = await db
      .from('campaigns')
      .insert(insertPayload)
      .select()
      .single()

    // Graceful fallback if database migration 002/005 has not been executed yet in Supabase
    if (error && (error.message.includes('column') || error.message.includes('schema cache'))) {
      console.warn('[Campaign] Retrying campaign creation with base schema columns:', error.message)
      const basePayload = {
        name: parsed.data.name,
        from_name: parsed.data.from_name,
        from_email: parsed.data.from_email,
        initial_template_id: parsed.data.initial_template_id || null,
        no_open_template_id: parsed.data.no_open_template_id || null,
        opened_no_reply_template_id: parsed.data.opened_no_reply_template_id || null,
        follow_up_delay_minutes: parsed.data.follow_up_delay_minutes,
        test_mode: parsed.data.test_mode,
        status: 'draft',
      }
      const retryResult = await db.from('campaigns').insert(basePayload).select().single()
      data = retryResult.data
      error = retryResult.error
    }

    if (error || !data) {
      return Response.json({ error: error?.message ?? 'Failed to create campaign' }, { status: 500 })
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
