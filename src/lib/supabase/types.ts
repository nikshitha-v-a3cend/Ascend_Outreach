// src/lib/supabase/types.ts
// TypeScript types matching the database schema

export type ContactStatus = 'queued' | 'sending' | 'sent' | 'opened' | 'no_open' | 'follow_up_sent' | 'replied' | 'bounced' | 'unsubscribed' | 'failed' | 'stopped' | 'manual_reply_sent'
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'stopped' | 'completed'
export type LogLevel = 'info' | 'warn' | 'error'
export type TemplateType = 'initial_outreach' | 'no_open' | 'opened_no_reply'
export type EmailMessageStatus = 'pending' | 'sent' | 'failed'

export interface ApifyEnrichmentData {
  company_about?: string
  company_highlights?: string[]
  person_linkedin_about?: string
  person_key_insights?: string[]
  sources?: string[]
  enriched_at?: string
}

export interface AIProfile {
  department?: string
  industry?: string
  persona?: string
  seniority?: string
  role_category?: string
  company_category?: string
  relevant_use_cases?: string[]
  pain_points?: string[]
  suggested_angle?: string
  summary?: string
  confidence?: number
  apify_enrichment?: ApifyEnrichmentData
}

export interface Contact {
  id: string
  first_name: string
  last_name: string | null
  email: string
  company: string | null
  designation: string | null
  linkedin_url?: string | null
  company_domain?: string | null
  department?: string | null
  industry?: string | null
  persona?: string | null
  seniority?: string | null
  role_category?: string | null
  company_category?: string | null
  relevant_use_cases?: string[] | null
  ai_profile?: AIProfile | null
  ai_profile_updated_at?: string | null
  apify_enrichment?: ApifyEnrichmentData | null
  source: string | null
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  name: string
  status: CampaignStatus
  test_mode: boolean
  from_name: string
  from_email: string
  from_title?: string | null
  initial_template_id: string | null
  no_open_template_id: string | null
  opened_no_reply_template_id: string | null
  follow_up_delay_minutes: number
  custom_instructions?: string | null
  messaging_guidelines?: string | null
  target_tone?: string | null
  created_at: string
  updated_at: string
}

export interface CampaignContact {
  id: string
  campaign_id: string
  contact_id: string
  status: ContactStatus
  current_step: number
  email_1_sent_at: string | null
  email_1_opened_at: string | null
  email_1_replied_at: string | null
  follow_up_due_at: string | null
  follow_up_sent_at: string | null
  replied: boolean
  opened: boolean
  bounced: boolean
  unsubscribed: boolean
  stopped: boolean
  created_at: string
  updated_at: string
}

export type AIAction =
  | 'SEND_FIRST_EMAIL'
  | 'SEND_FOLLOWUP'
  | 'CHANGE_SUBJECT'
  | 'CHANGE_MESSAGING_ANGLE'
  | 'SEND_RELEVANT_CONTENT'
  | 'ASK_A_QUESTION'
  | 'REENGAGE_THREAD'
  | 'ANSWER_AND_FOLLOWUP'
  | 'WAIT'
  | 'STOP'
  | 'HAND_TO_HUMAN'

export interface AIDecision {
  id: string
  contact_id: string
  campaign_id: string | null
  action: AIAction | string
  reason: string
  strategy?: string | null
  tone?: string | null
  suggested_angle?: string | null
  wait_minutes?: number
  context?: Record<string, unknown> | null
  created_at: string
}

export interface EmailMessage {
  id: string
  campaign_id: string
  contact_id: string
  campaign_contact_id: string
  step: number
  template_type: TemplateType | 'ai_personalized'
  subject?: string | null
  body_text?: string | null
  body_html?: string | null
  decision_id?: string | null
  personalization_context?: Record<string, unknown> | null
  sendgrid_message_id: string | null
  status: EmailMessageStatus
  sent_at: string | null
  created_at: string
}

export interface EmailEvent {
  id: string
  email_message_id: string | null
  campaign_id: string | null
  contact_id: string | null
  event_type: string
  sendgrid_event_id: string | null
  event_timestamp: string | null
  raw_event: Record<string, unknown> | null
  created_at: string
}

export interface Reply {
  id: string
  campaign_id: string | null
  contact_id: string | null
  from_email: string
  to_email: string | null
  subject: string | null
  body_text: string | null
  body_html: string | null
  message_id: string | null
  received_at: string
  raw_payload: Record<string, unknown> | null
  ai_intent?: string | null
  ai_analysis?: Record<string, unknown> | null
  created_at: string
}

export interface CampaignLog {
  id: string
  campaign_id: string
  contact_id: string | null
  level: LogLevel
  message: string
  metadata: Record<string, unknown> | null
  created_at: string
}

// Extended types for UI
export interface CampaignContactWithContact extends CampaignContact {
  contact: Contact
  latest_decision?: AIDecision | null
}

export interface CampaignWithStats extends Campaign {
  total_contacts?: number
  sent_count?: number
  opened_count?: number
  replied_count?: number
  bounced_count?: number
  unsubscribed_count?: number
  follow_up_sent_count?: number
}

export interface DashboardStats {
  total_contacts: number
  active_campaigns: number
  emails_sent: number
  delivered: number
  opened: number
  replies: number
  follow_ups_sent: number
  bounced: number
  unsubscribed: number
}

export interface ActivityItem {
  id: string
  contact_name: string
  company: string | null
  event_type: string
  event_description: string
  created_at: string
}
