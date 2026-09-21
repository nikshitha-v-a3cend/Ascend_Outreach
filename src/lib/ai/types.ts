// src/lib/ai/types.ts
// Domain types for AI classification, decisions, generation, and reply analysis

import type { AIAction, Contact, EmailMessage, Reply } from '@/lib/supabase/types'

export interface ContactClassificationInput {
  first_name: string
  last_name?: string | null
  email: string
  company?: string | null
  department?: string | null
  designation?: string | null
}

export interface ContactClassificationOutput {
  department: string
  industry: string
  persona: string
  seniority: 'C-Level' | 'VP' | 'Director' | 'Manager' | 'Individual Contributor' | 'Founder' | 'Unknown'
  role_category: string
  company_category: 'Enterprise' | 'Mid-Market' | 'SMB' | 'Startup' | 'Unknown'
  relevant_use_cases: string[]
  pain_points: string[]
  suggested_angle: string
  summary: string
  confidence: number
}

export interface DecisionContext {
  contact: Contact
  campaign: {
    id: string
    name: string
    from_name: string
    from_email: string
    objective?: string
    offering?: string
    messaging_guidelines?: string | null
  }
  campaign_contact: {
    id: string
    status: string
    current_step: number
    email_1_sent_at?: string | null
    email_1_opened_at?: string | null
    follow_up_sent_at?: string | null
    opened: boolean
    replied: boolean
    bounced: boolean
  }
  email_history: Array<{
    step: number
    subject?: string | null
    body_text?: string | null
    sent_at?: string | null
    template_type?: string | null
  }>
  events: Array<{
    event_type: string
    event_timestamp?: string | null
  }>
  replies: Array<{
    from_email: string
    subject?: string | null
    body_text?: string | null
    received_at: string
  }>
  previous_decisions: Array<{
    action: string
    reason: string
    strategy?: string | null
    created_at: string
  }>
}

export interface DecisionOutput {
  action: AIAction
  reason: string
  strategy: string
  tone: string
  suggested_angle: string
  wait_minutes: number
  confidence: number
}

export interface EmailGenerationContext {
  contact: Contact
  campaign: {
    name: string
    from_name: string
    from_email: string
    from_title?: string | null
    objective?: string
    offering?: string
  }
  step: number
  decision: {
    action: string
    reason: string
    strategy?: string | null
    suggested_angle?: string | null
    tone?: string | null
  }
  previous_emails: Array<{
    step: number
    subject?: string | null
    body_text?: string | null
  }>
  replies_history?: Array<{
    from_email: string
    subject: string | null
    body_text: string | null
    received_at?: string
  }>
  interaction_summary: {
    opened_count: number
    last_opened_at?: string | null
    replied: boolean
  }
}

export interface GeneratedEmailOutput {
  recipient_analysis?: string
  subject: string
  body_text: string
  body_html: string
  call_to_action: string
  messaging_angle: string
  personalization_highlights: string[]
}

export interface ReplyAnalysisInput {
  reply: Reply
  contact?: Contact | null
  previous_emails?: EmailMessage[]
}

export interface ReplyAnalysisOutput {
  intent: 'interested' | 'not_interested' | 'asking_information' | 'wants_meeting' | 'objection' | 'out_of_office' | 'unsubscribe' | 'other'
  sentiment: 'positive' | 'neutral' | 'negative'
  summary: string
  suggested_action: AIAction
  reason: string
  action_needed_by_human: boolean
}
