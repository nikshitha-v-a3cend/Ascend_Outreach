-- ============================================================
-- A3CEND Outreach — Initial Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    TEXT NOT NULL,
  last_name     TEXT,
  email         TEXT NOT NULL UNIQUE,
  company       TEXT,
  designation   TEXT,
  source        TEXT DEFAULT 'csv_import',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts (email);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts (created_at DESC);

-- ============================================================
-- campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'draft',
  test_mode                   BOOLEAN NOT NULL DEFAULT TRUE,
  from_name                   TEXT NOT NULL,
  from_email                  TEXT NOT NULL,
  initial_template_id         TEXT,
  no_open_template_id         TEXT,
  opened_no_reply_template_id TEXT,
  follow_up_delay_minutes     INTEGER NOT NULL DEFAULT 2880, -- 2 days default
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- status values: draft | active | paused | stopped | completed
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns (created_at DESC);

-- ============================================================
-- campaign_contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id        UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'queued',
  current_step      INTEGER NOT NULL DEFAULT 0,
  email_1_sent_at   TIMESTAMPTZ,
  email_1_opened_at TIMESTAMPTZ,
  email_1_replied_at TIMESTAMPTZ,
  follow_up_due_at  TIMESTAMPTZ,
  follow_up_sent_at TIMESTAMPTZ,
  replied           BOOLEAN NOT NULL DEFAULT FALSE,
  opened            BOOLEAN NOT NULL DEFAULT FALSE,
  bounced           BOOLEAN NOT NULL DEFAULT FALSE,
  unsubscribed      BOOLEAN NOT NULL DEFAULT FALSE,
  stopped           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contact_id)
);

-- status values: queued | sending | sent | opened | no_open | follow_up_sent | replied | bounced | unsubscribed | failed | stopped

CREATE INDEX IF NOT EXISTS idx_cc_campaign_id ON campaign_contacts (campaign_id);
CREATE INDEX IF NOT EXISTS idx_cc_contact_id ON campaign_contacts (contact_id);
CREATE INDEX IF NOT EXISTS idx_cc_status ON campaign_contacts (status);
CREATE INDEX IF NOT EXISTS idx_cc_follow_up_due_at ON campaign_contacts (follow_up_due_at) WHERE follow_up_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cc_stopped ON campaign_contacts (stopped) WHERE stopped = FALSE;

-- ============================================================
-- email_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS email_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id            UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_contact_id   UUID NOT NULL REFERENCES campaign_contacts(id) ON DELETE CASCADE,
  step                  INTEGER NOT NULL DEFAULT 1,
  template_type         TEXT NOT NULL, -- initial_outreach | no_open | opened_no_reply
  sendgrid_message_id   TEXT,         -- X-Message-Id from SendGrid response
  status                TEXT NOT NULL DEFAULT 'pending',
  sent_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- status values: pending | sent | failed

CREATE INDEX IF NOT EXISTS idx_em_campaign_id ON email_messages (campaign_id);
CREATE INDEX IF NOT EXISTS idx_em_contact_id ON email_messages (contact_id);
CREATE INDEX IF NOT EXISTS idx_em_campaign_contact_id ON email_messages (campaign_contact_id);
CREATE INDEX IF NOT EXISTS idx_em_sendgrid_message_id ON email_messages (sendgrid_message_id) WHERE sendgrid_message_id IS NOT NULL;

-- ============================================================
-- email_events
-- ============================================================
CREATE TABLE IF NOT EXISTS email_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_message_id    UUID REFERENCES email_messages(id) ON DELETE SET NULL,
  campaign_id         UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
  event_type          TEXT NOT NULL,
  sendgrid_event_id   TEXT UNIQUE,     -- sg_event_id for idempotency
  event_timestamp     TIMESTAMPTZ,
  raw_event           JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- event_type values: processed | delivered | open | click | bounce | dropped | deferred | spamreport | unsubscribe | group_unsubscribe

CREATE INDEX IF NOT EXISTS idx_ee_campaign_id ON email_events (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ee_contact_id ON email_events (contact_id);
CREATE INDEX IF NOT EXISTS idx_ee_event_type ON email_events (event_type);
CREATE INDEX IF NOT EXISTS idx_ee_sendgrid_event_id ON email_events (sendgrid_event_id) WHERE sendgrid_event_id IS NOT NULL;

-- ============================================================
-- replies
-- ============================================================
CREATE TABLE IF NOT EXISTS replies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  from_email  TEXT NOT NULL,
  to_email    TEXT,
  subject     TEXT,
  body_text   TEXT,
  body_html   TEXT,
  message_id  TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replies_campaign_id ON replies (campaign_id);
CREATE INDEX IF NOT EXISTS idx_replies_contact_id ON replies (contact_id);
CREATE INDEX IF NOT EXISTS idx_replies_from_email ON replies (from_email);

-- ============================================================
-- campaign_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  level       TEXT NOT NULL DEFAULT 'info',  -- info | warn | error
  message     TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_campaign_id ON campaign_logs (campaign_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON campaign_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON campaign_logs (level);

-- ============================================================
-- Triggers: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_contacts
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_campaigns
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_campaign_contacts
  BEFORE UPDATE ON campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by server-side code with SUPABASE_SECRET_KEY)
-- The server-side client uses the service role key which bypasses RLS automatically

-- For anon key (browser / public access) - deny all by default
-- All sensitive operations go through server-side API routes using the service role key

-- Grant select to authenticated users (for future auth integration)
CREATE POLICY "service_role_all_contacts" ON contacts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_campaigns" ON campaigns
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_campaign_contacts" ON campaign_contacts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_email_messages" ON email_messages
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_email_events" ON email_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_replies" ON replies
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_campaign_logs" ON campaign_logs
  FOR ALL USING (auth.role() = 'service_role');
