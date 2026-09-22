-- ============================================================
-- A3CEND Outreach — Configurable Follow-up Count
-- Run this in the Supabase SQL Editor
--
-- Lets each campaign set its own number of follow-up emails (after the
-- initial send) instead of the hardcoded 2-step automated cap. NULL means
-- "unlimited" — the app still enforces an absolute hard ceiling
-- (ABSOLUTE_MAX_SEQUENCE_STEPS in src/lib/ai/safety.ts) so "unlimited"
-- never means truly infinite.
-- ============================================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS max_follow_ups INTEGER DEFAULT 2;

-- Backfill any pre-existing rows explicitly to 2 so this migration never
-- silently switches existing campaigns to "unlimited".
UPDATE campaigns SET max_follow_ups = 2 WHERE max_follow_ups IS NULL;
