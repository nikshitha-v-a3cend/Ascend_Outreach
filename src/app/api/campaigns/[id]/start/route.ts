// src/app/api/campaigns/[id]/start/route.ts
// Starts a campaign: validates, then sends Email #1 (AI-personalized, with
// template fallback) to a batch of queued contacts.
//
// SCALE NOTE: sending is intentionally batched (ENROLLMENT_BATCH_SIZE per
// call) instead of looping over every enrolled contact in one request. A
// campaign with hundreds or thousands of queued contacts would otherwise
// keep this request open until a serverless function timeout kills it.
// Whatever is left "queued" after this call is picked up automatically by
// the cron endpoint's enrollment sweep every 5 minutes (see
// src/app/api/cron/process-followups/route.ts) — no manual re-clicking,
// no matter how large the contact list is.

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { runInitialSend } from '@/lib/ai/orchestration'
import { ENROLLMENT_BATCH_SIZE, DAILY_SEND_LIMIT_PER_CAMPAIGN, getCampaignSentToday } from '@/lib/ai/safety'
import type { Contact } from '@/lib/supabase/types'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  try {
    const db = getServerSupabase()

    // 1. Load campaign
    const { data: campaign, error: campErr } = await db
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (campErr || !campaign) {
      return Response.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (!['draft', 'paused'].includes(campaign.status)) {
      return Response.json(
        { error: `Cannot start campaign in status: ${campaign.status}` },
        { status: 400 }
      )
    }

    // NOTE: initial_template_id is no longer required to start a campaign.
    // The AI generates personalized copy for every contact; a configured
    // template is now only a fallback used if AI generation fails.

    // 2. How many contacts are queued in total (for reporting + budget math)
    const { count: totalQueued } = await db
      .from('campaign_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'queued')

    if (!totalQueued || totalQueued === 0) {
      return Response.json(
        { error: 'No queued contacts found in this campaign. Add contacts before starting.' },
        { status: 400 }
      )
    }

    // 3. Set campaign to active (idempotent — safe if it's already active)
    await db.from('campaigns').update({ status: 'active' }).eq('id', campaignId)

    // 4. Hard backend safety rule: daily send cap per campaign. The AI
    // cannot override this — it's enforced here regardless of any decision.
    const sentToday = await getCampaignSentToday(db, campaignId)
    const remainingBudget = DAILY_SEND_LIMIT_PER_CAMPAIGN - sentToday

    if (remainingBudget <= 0) {
      return Response.json({
        success: true,
        campaign_id: campaignId,
        results: { sent: 0, failed: 0, skipped: 0 },
        remaining_queued: totalQueued,
        message: `Campaign is active, but today's send limit (${DAILY_SEND_LIMIT_PER_CAMPAIGN}) has already been reached. The remaining ${totalQueued} queued contacts will start sending automatically once the daily limit resets.`,
      })
    }

    // 5. Pull a bounded batch of queued contacts (oldest first) — this
    // request always returns quickly no matter how large the campaign is.
    const batchSize = Math.min(ENROLLMENT_BATCH_SIZE, remainingBudget)
    const { data: enrolledCCs, error: conErr } = await db
      .from('campaign_contacts')
      .select('*, contacts(*)')
      .eq('campaign_id', campaignId)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (conErr || !enrolledCCs || enrolledCCs.length === 0) {
      return Response.json({ error: 'No queued contacts found to send to.' }, { status: 400 })
    }

    // 6. For each contact in this batch: claim it, then run the shared AI
    // send pipeline (classify -> decide -> generate -> send -> record).
    const results = { sent: 0, failed: 0, skipped: 0 }

    for (const cc of enrolledCCs) {
      const contact = (Array.isArray(cc.contacts) ? cc.contacts[0] : cc.contacts) as Contact | null
      if (!contact) {
        results.skipped++
        continue
      }

      // Atomic claim (also guards against the cron enrollment sweep
      // picking up the same row concurrently)
      const { data: claimed } = await db
        .from('campaign_contacts')
        .update({ status: 'sending' })
        .eq('id', cc.id)
        .eq('status', 'queued')
        .select('id')
        .single()

      if (!claimed) {
        results.skipped++
        continue
      }

      const outcome = await runInitialSend(db, campaign, contact, cc.id)
      if (outcome.sent) results.sent++
      else if (outcome.skipped) results.skipped++
      else results.failed++
    }

    const remainingQueued = Math.max(totalQueued - enrolledCCs.length, 0)

    console.log('[Campaign Start] Batch complete:', {
      campaign_id: campaignId,
      ...results,
      remaining_queued: remainingQueued,
    })

    return Response.json({
      success: true,
      campaign_id: campaignId,
      results,
      remaining_queued: remainingQueued,
      message:
        remainingQueued > 0
          ? `This batch: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped. ${remainingQueued} more contacts are queued and will send automatically over the next few cron cycles — no further action needed.`
          : `Campaign started. Sent: ${results.sent}, Failed: ${results.failed}, Skipped: ${results.skipped}`,
    })
  } catch (err: unknown) {
    console.error('[Campaign Start] Error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to start campaign' },
      { status: 500 }
    )
  }
}
