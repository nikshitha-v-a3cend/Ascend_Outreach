// src/lib/ai/safety.ts
// Hard backend safety limits for the AI outreach engine.
//
// The AI decides strategy (what to send, when, and why). These constants
// decide what it is ALLOWED to do — the AI can never bypass them. This is
// the Phase 7 "hard rules" layer: caps that hold even if the model
// hallucinates a bad decision or a prompt produces unexpected output.

// Default number of follow-up emails (after the initial send) for a newly
// created campaign, matching the product's historical behavior. Each
// campaign can override this (or go "unlimited") in its own settings.
export const DEFAULT_MAX_FOLLOW_UPS = 2

// Absolute hard ceiling on total emails (initial + follow-ups) a single
// contact can ever receive within one campaign — enforced regardless of
// what the campaign is configured to do, including a campaign set to
// "unlimited" follow-ups. This is the backstop against a runaway decision
// loop or a bad config; it's intentionally generous since
// DAILY_SEND_LIMIT_PER_CAMPAIGN and the per-step delay already bound the
// real-world pace of sends.
export const ABSOLUTE_MAX_SEQUENCE_STEPS = 100

/**
 * Resolves a campaign's configured follow-up count into the actual max
 * total steps for that campaign (the initial email counts as step 1),
 * always bounded by ABSOLUTE_MAX_SEQUENCE_STEPS.
 *
 * `null` is a deliberate "unlimited" choice (only reachable once the
 * max_follow_ups column exists and a campaign was explicitly set that way).
 * `undefined` means the column wasn't present on the row at all — e.g. the
 * migration adding it hasn't been applied to this database yet — and is
 * treated as the historical default rather than "unlimited", so an
 * un-migrated database doesn't silently start sending far more follow-ups
 * than before.
 */
export function resolveMaxSteps(maxFollowUps: number | null | undefined): number {
  if (maxFollowUps === undefined) return Math.min(DEFAULT_MAX_FOLLOW_UPS + 1, ABSOLUTE_MAX_SEQUENCE_STEPS)
  if (maxFollowUps === null) return ABSOLUTE_MAX_SEQUENCE_STEPS
  return Math.min(maxFollowUps + 1, ABSOLUTE_MAX_SEQUENCE_STEPS)
}

// Floor for how soon the next action can fire after this one, in minutes.
// Prevents an AI-suggested wait_minutes of 0 (or a missing value) from
// causing rapid-fire sends. Test campaigns can still use short delays —
// this only stops "immediately again," not "soon."
export const MIN_WAIT_MINUTES = 5

// Max emails (initial + follow-up) a single campaign may send per UTC day.
// A simple, global backend ceiling — independent of what the AI decides —
// so a runaway decision loop or a bad import can't blast a contact list.
export const DAILY_SEND_LIMIT_PER_CAMPAIGN = 500

// Max "queued" contacts turned into a sent Email #1 per campaign per call
// (either a manual Start click or one cron tick). Keeps a single request
// fast regardless of campaign size — a campaign with thousands of contacts
// drains over several cron ticks automatically instead of one huge request.
export const ENROLLMENT_BATCH_SIZE = 25

// Max due follow-ups processed per cron tick, across all active campaigns.
export const FOLLOWUP_BATCH_SIZE = 100

// Max unclassified contacts auto-classified per cron tick.
export const CLASSIFY_BATCH_SIZE = 25

// How many OpenAI classification calls run in parallel within one batch.
export const CLASSIFY_CONCURRENCY = 5

/**
 * Returns the count of successfully-sent emails for a campaign since the
 * start of the current UTC day. Used to enforce DAILY_SEND_LIMIT_PER_CAMPAIGN.
 */
export async function getCampaignSentToday(
  db: ReturnType<typeof import('@/lib/supabase/server').getServerSupabase>,
  campaignId: string
): Promise<number> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { count } = await db
    .from('email_messages')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'sent')
    .gte('sent_at', startOfDay.toISOString())

  return count ?? 0
}
