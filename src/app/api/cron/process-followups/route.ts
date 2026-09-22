// src/app/api/cron/process-followups/route.ts
// Cron-driven engine for the AI outreach sequence. Runs every 5 minutes
// (see vercel.json) and, per tick, does three sweeps:
//
//   0. Classification sweep — auto-classifies a bounded batch of contacts
//      that were imported but never AI-profiled, with a concurrency cap.
//      Importing thousands of contacts never needs a manual "Classify All"
//      click — they get profiled automatically over a few ticks.
//
//   1. Enrollment sweep — sends Email #1 (AI-personalized, template
//      fallback) to a bounded batch of "queued" contacts per active
//      campaign. A campaign with thousands of contacts drains over several
//      ticks instead of one huge request.
//
//   2. Follow-up sweep — runs the AI decision engine for every contact
//      whose follow_up_due_at has passed, and acts on whatever the AI
//      returns (send / wait / stop / hand off) — not a fixed two-template
//      branch. This loops across as many steps as the AI decides, capped
//      by that campaign's own configured follow-up count (or the absolute
//      backend ceiling for a campaign set to "unlimited").
//
// Every hard limit (max steps, min wait, daily send cap, batch sizes) lives
// in src/lib/ai/safety.ts and is enforced regardless of what the AI
// decides — the AI chooses strategy, the backend chooses limits.

export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { runInitialSend, runFollowUpAction } from '@/lib/ai/orchestration'
import { classifyContact } from '@/lib/ai/service'
import { mergeAiProfile } from '@/lib/ai/profile'
import { mapWithConcurrency } from '@/lib/ai/concurrency'
import {
  ENROLLMENT_BATCH_SIZE,
  FOLLOWUP_BATCH_SIZE,
  CLASSIFY_BATCH_SIZE,
  CLASSIFY_CONCURRENCY,
  ABSOLUTE_MAX_SEQUENCE_STEPS,
  DAILY_SEND_LIMIT_PER_CAMPAIGN,
  getCampaignSentToday,
} from '@/lib/ai/safety'
import type { Contact } from '@/lib/supabase/types'

// The app's own campaign page polls this endpoint every 30s to drive the
// live "auto-run" UI — that's a same-origin browser request, not a
// genuinely external caller, so it doesn't need to know CRON_SECRET (which
// would mean shipping the secret to every browser that loads the page).
// An external scheduler (real cron, a manual curl) still needs the secret.
function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get('origin') || req.headers.get('referer')
  const host = req.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls from outside the app
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isAuthorizedExternal = !cronSecret || authHeader === `Bearer ${cronSecret}`
  if (!isAuthorizedExternal && !isSameOriginRequest(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServerSupabase()
  const now = new Date().toISOString()

  let campaignIdFilter: string | null = null
  let forceSend = false

  try {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await req.json()
      if (body?.campaign_id) campaignIdFilter = body.campaign_id
      if (body?.force) forceSend = Boolean(body.force)
    }
  } catch {
    // Non-JSON body or empty body
  }

  const searchParams = req.nextUrl?.searchParams
  if (searchParams) {
    if (searchParams.get('campaign_id')) campaignIdFilter = searchParams.get('campaign_id')
    if (searchParams.get('force') === 'true') forceSend = true
  }

  const results = {
    classified: 0,
    enrolled_sent: 0,
    enrolled_failed: 0,
    enrolled_skipped: 0,
    followup_processed: 0,
    followup_sent: 0,
    followup_failed: 0,
    followup_skipped: 0,
  }

  try {
    // ============================================================
    // Sweep 0: auto-classify a bounded batch of unprofiled contacts
    // ============================================================
    try {
      const { data: unclassified } = await db
        .from('contacts')
        .select('*')
        .is('ai_profile_updated_at', null)
        .order('created_at', { ascending: true })
        .limit(CLASSIFY_BATCH_SIZE)

      if (unclassified && unclassified.length > 0) {
        await mapWithConcurrency(unclassified, CLASSIFY_CONCURRENCY, async (contact) => {
          try {
            const classification = await classifyContact({
              first_name: contact.first_name,
              last_name: contact.last_name,
              email: contact.email,
              company: contact.company,
              designation: contact.designation,
              department: contact.department,
            })
            await db
              .from('contacts')
              .update({
                department: classification.department,
                industry: classification.industry,
                persona: classification.persona,
                seniority: classification.seniority,
                role_category: classification.role_category,
                company_category: classification.company_category,
                relevant_use_cases: classification.relevant_use_cases,
                ai_profile: mergeAiProfile(contact.ai_profile, classification) as any,
                ai_profile_updated_at: new Date().toISOString(),
              })
              .eq('id', contact.id)
            results.classified++
          } catch (err) {
            console.warn('[Cron] Auto-classification failed for contact:', contact.id, err)
          }
        })
      }
    } catch (classifySweepErr) {
      console.warn('[Cron] Classification sweep error:', classifySweepErr)
    }

    // ============================================================
    // Load active campaigns (used by both remaining sweeps)
    // ============================================================
    let campQuery = db.from('campaigns').select('*')
    if (campaignIdFilter) {
      campQuery = campQuery.eq('id', campaignIdFilter)
    } else {
      campQuery = campQuery.eq('status', 'active')
    }
    const { data: activeCampaigns } = await campQuery

    if (!activeCampaigns || activeCampaigns.length === 0) {
      return Response.json({ ...results, message: 'No matching active campaigns' })
    }

    // ============================================================
    // Sweep 1: enrollment — send Email #1 to queued contacts
    // ============================================================
    const enrolledContactIds = new Set<string>()

    for (const campaign of activeCampaigns) {
      try {
        const sentToday = await getCampaignSentToday(db, campaign.id)
        let remainingBudget = DAILY_SEND_LIMIT_PER_CAMPAIGN - sentToday
        if (remainingBudget <= 0) continue

        const { data: queuedCCs } = await db
          .from('campaign_contacts')
          .select('*, contacts(*)')
          .eq('campaign_id', campaign.id)
          .eq('status', 'queued')
          .order('created_at', { ascending: true })
          .limit(Math.min(ENROLLMENT_BATCH_SIZE, remainingBudget))

        for (const cc of queuedCCs ?? []) {
          if (remainingBudget <= 0) break

          const contact = (Array.isArray(cc.contacts) ? cc.contacts[0] : cc.contacts) as Contact | null
          if (!contact) {
            results.enrolled_skipped++
            continue
          }

          const { data: claimed } = await db
            .from('campaign_contacts')
            .update({ status: 'sending' })
            .eq('id', cc.id)
            .eq('status', 'queued')
            .select('id')
            .single()

          if (!claimed) {
            results.enrolled_skipped++
            continue
          }

          const outcome = await runInitialSend(db, campaign, contact, cc.id)
          if (outcome.sent) {
            results.enrolled_sent++
            remainingBudget--
            enrolledContactIds.add(cc.id)
          } else if (outcome.skipped) {
            results.enrolled_skipped++
          } else {
            results.enrolled_failed++
          }
        }
      } catch (campErr) {
        console.error('[Cron] Enrollment sweep failed for campaign', campaign.id, campErr)
      }
    }

    // ============================================================
    // Sweep 2: AI-driven follow-ups for contacts past their due date
    // ============================================================
    const activeCampaignIds = activeCampaigns.map((c) => c.id)
    const campaignMap = Object.fromEntries(activeCampaigns.map((c) => [c.id, c]))

    // Each campaign's own configured follow-up count (or "unlimited") is
    // enforced per-row inside runFollowUpAction, where the campaign object
    // is available. This is just a coarse pre-filter so the query doesn't
    // scan rows that could never be actionable under any campaign config.
    const maxStepForSweep = ABSOLUTE_MAX_SEQUENCE_STEPS

    // Build follow-up candidate query
    let followupQuery = db
      .from('campaign_contacts')
      .select(`
        id, campaign_id, contact_id, opened, replied, bounced, unsubscribed, stopped,
        follow_up_due_at, follow_up_sent_at, email_1_sent_at, current_step, status
      `)
      .in('campaign_id', activeCampaignIds)
      .in('status', ['sent', 'opened', 'no_open', 'follow_up_sent', 'manual_reply_sent', 'stopped'])
      .eq('replied', false)
      .eq('bounced', false)
      .eq('unsubscribed', false)
      .lt('current_step', maxStepForSweep)

    if (!forceSend) {
      followupQuery = followupQuery
        .eq('stopped', false)
        .lte('follow_up_due_at', now)
        .not('follow_up_due_at', 'is', null)
    }

    const { data: dueCCs } = await followupQuery.limit(FOLLOWUP_BATCH_SIZE)

    for (const cc of dueCCs ?? []) {
      // 1. Guard against double-send in the same execution:
      // If contact just received Email #1 in Sweep 1, NEVER send a follow-up in the same tick!
      if (enrolledContactIds.has(cc.id)) {
        results.followup_skipped++
        continue
      }

      const campaign = campaignMap[cc.campaign_id]
      if (!campaign) {
        results.followup_skipped++
        continue
      }

      // 2. Cooldown / delay interval guard:
      // Even when manually triggered ("Run Follow-ups Now"), respect the campaign delay
      // since the last email (email 1 or previous follow-up). Never rapid-fire emails.
      const lastEmailTimestamp = cc.follow_up_sent_at || cc.email_1_sent_at
      if (lastEmailTimestamp) {
        const elapsedMinutes = (Date.now() - new Date(lastEmailTimestamp).getTime()) / (60 * 1000)
        const requiredDelayMinutes = campaign.follow_up_delay_minutes ?? 5
        if (elapsedMinutes < requiredDelayMinutes) {
          // Still within the waiting delay period! Skip sending to prevent rapid-fire spam.
          results.followup_skipped++
          continue
        }
      }

      results.followup_processed++

      // Daily cap check before spending an AI call on this contact
      const sentToday = await getCampaignSentToday(db, cc.campaign_id)
      if (sentToday >= DAILY_SEND_LIMIT_PER_CAMPAIGN) {
        // Push the due date forward instead of re-checking (and failing)
        // this same cap every single tick.
        await db
          .from('campaign_contacts')
          .update({ follow_up_due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
          .eq('id', cc.id)
        results.followup_skipped++
        continue
      }

      // Atomic claim: optimistic lock on current_step.
      // If forceSend is true, allow claiming a contact that reached the 2-step automated stop.
      let claimQuery = db
        .from('campaign_contacts')
        .update({ status: 'follow_up_sending', stopped: false })
        .eq('id', cc.id)
        .eq('current_step', cc.current_step)
        .eq('replied', false)
        .eq('bounced', false)
        .eq('unsubscribed', false)

      if (!forceSend) {
        claimQuery = claimQuery.eq('stopped', false)
      }

      const { data: claimed } = await claimQuery.select('id').single()

      if (!claimed) {
        results.followup_skipped++
        continue
      }

      // Re-check after claiming (safety against races between the initial
      // select and the claim above)
      const { data: freshCC } = await db
        .from('campaign_contacts')
        .select('*')
        .eq('id', cc.id)
        .single()

      const priorStatus = cc.status === 'manual_reply_sent' ? 'manual_reply_sent' : cc.current_step <= 1 ? 'sent' : 'follow_up_sent'

      if (!freshCC || freshCC.replied || freshCC.bounced || freshCC.unsubscribed || (!forceSend && freshCC.stopped)) {
        await db.from('campaign_contacts').update({ status: cc.status, stopped: cc.stopped }).eq('id', cc.id)
        results.followup_skipped++
        continue
      }

      const { data: contact } = await db.from('contacts').select('*').eq('id', cc.contact_id).single()
      if (!contact) {
        await db.from('campaign_contacts').update({ status: priorStatus, stopped: cc.stopped }).eq('id', cc.id)
        results.followup_skipped++
        continue
      }

      const outcome = await runFollowUpAction(
        db,
        campaign,
        {
          id: cc.id,
          campaign_id: cc.campaign_id,
          contact_id: cc.contact_id,
          current_step: cc.current_step,
          opened: freshCC.opened,
          replied: freshCC.replied,
          bounced: freshCC.bounced,
          unsubscribed: freshCC.unsubscribed,
          stopped: freshCC.stopped,
          status: cc.status,
          follow_up_due_at: cc.follow_up_due_at,
        },
        contact as Contact
      )

      if (outcome.outcome === 'sent') results.followup_sent++
      else if (outcome.outcome === 'failed') results.followup_failed++
      else results.followup_skipped++
    }

    console.log('[Cron] Tick complete:', results)

    return Response.json({ success: true, ...results, timestamp: now })
  } catch (err: unknown) {
    console.error('[Cron] Unexpected error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Cron failed' },
      { status: 500 }
    )
  }
}

// Also support GET for simple health check / manual trigger
export async function GET(req: NextRequest) {
  return POST(req)
}
