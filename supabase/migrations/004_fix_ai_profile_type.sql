-- ============================================================
-- A3CEND Outreach — Fix ai_profile Column Type
-- Run this in the Supabase SQL Editor
--
-- contacts.ai_profile is currently TEXT, not JSONB, even though
-- migration 002 declared it as JSONB — that ADD COLUMN IF NOT EXISTS
-- was a no-op because the column already existed (as TEXT) by then.
--
-- A TEXT column means every write stores a JSON-encoded STRING, and
-- every read returns that string back instead of a parsed object.
-- Application code expects an object (checks like `ai_profile.persona`,
-- merges like `{...ai_profile, ...updates}`), so on a string those
-- checks always come back empty/undefined — the code has been treating
-- every contact as "never classified, never enriched" on every single
-- request and redoing the full Apify search + AI classification work
-- every time, and older code that spread the string directly corrupted
-- a couple of contacts' ai_profile into a multi-megabyte blob of
-- per-character keys (already cleaned up separately).
--
-- This converts the column to real JSONB so it round-trips as an
-- object the way the application already assumes.
-- ============================================================

ALTER TABLE contacts
  ALTER COLUMN ai_profile TYPE JSONB USING ai_profile::jsonb;
