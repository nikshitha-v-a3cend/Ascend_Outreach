-- ============================================================
-- A3CEND Outreach — Contact Source Links
-- Run this in the Supabase SQL Editor
--
-- Lets a contact carry a known LinkedIn profile URL and/or company
-- website domain, so Apify enrichment can search a verified source
-- directly instead of guessing a match from name + company alone.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS company_domain TEXT;
