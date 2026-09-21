-- ============================================================
-- A3CEND Outreach — AI Engine Database Extensions
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Extend contacts table with AI Profile & Classification fields
ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS persona TEXT,
  ADD COLUMN IF NOT EXISTS seniority TEXT,
  ADD COLUMN IF NOT EXISTS role_category TEXT,
  ADD COLUMN IF NOT EXISTS company_category TEXT,
  ADD COLUMN IF NOT EXISTS relevant_use_cases JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_profile JSONB,
  ADD COLUMN IF NOT EXISTS ai_profile_updated_at TIMESTAMPTZ;

-- 1b. Extend campaigns table with AI custom instructions, tone guidelines & sender title
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS from_title TEXT DEFAULT 'Enterprise Solutions & Growth',
  ADD COLUMN IF NOT EXISTS custom_instructions TEXT,
  ADD COLUMN IF NOT EXISTS messaging_guidelines TEXT,
  ADD COLUMN IF NOT EXISTS target_tone TEXT DEFAULT 'Professional & Consultative';

-- 2. Create ai_decisions table for audit trail & decision history
CREATE TABLE IF NOT EXISTS ai_decisions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id       UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  action            TEXT NOT NULL,
  reason            TEXT NOT NULL,
  strategy          TEXT,
  tone              TEXT,
  suggested_angle   TEXT,
  wait_minutes      INTEGER DEFAULT 0,
  context           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_decisions_contact_id ON ai_decisions (contact_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_campaign_id ON ai_decisions (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_created_at ON ai_decisions (created_at DESC);

-- 3. Extend email_messages to store AI-generated subjects, content & decision linkage
ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS body_text TEXT,
  ADD COLUMN IF NOT EXISTS body_html TEXT,
  ADD COLUMN IF NOT EXISTS decision_id UUID REFERENCES ai_decisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS personalization_context JSONB;

CREATE INDEX IF NOT EXISTS idx_em_decision_id ON email_messages (decision_id) WHERE decision_id IS NOT NULL;

-- 4. Enable RLS on ai_decisions
ALTER TABLE ai_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_ai_decisions" ON ai_decisions
  FOR ALL USING (auth.role() = 'service_role');
