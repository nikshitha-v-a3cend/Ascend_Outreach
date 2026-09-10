// src/lib/supabase/database.types.ts
// Minimal database type definitions for Supabase JS v2
// These match the schema in supabase/migrations/001_initial_schema.sql
// Generated types would normally come from: npx supabase gen types typescript

export interface Database {
  public: {
    Tables: {
      contacts: {
        Row: {
          id: string
          first_name: string
          last_name: string | null
          email: string
          company: string | null
          designation: string | null
          source: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          first_name: string
          last_name?: string | null
          email: string
          company?: string | null
          designation?: string | null
          source?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          first_name?: string
          last_name?: string | null
          email?: string
          company?: string | null
          designation?: string | null
          source?: string | null
          updated_at?: string
        }
      }
      campaigns: {
        Row: {
          id: string
          name: string
          status: string
          test_mode: boolean
          from_name: string
          from_email: string
          initial_template_id: string | null
          no_open_template_id: string | null
          opened_no_reply_template_id: string | null
          follow_up_delay_minutes: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          status?: string
          test_mode?: boolean
          from_name: string
          from_email: string
          initial_template_id?: string | null
          no_open_template_id?: string | null
          opened_no_reply_template_id?: string | null
          follow_up_delay_minutes?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          status?: string
          test_mode?: boolean
          from_name?: string
          from_email?: string
          initial_template_id?: string | null
          no_open_template_id?: string | null
          opened_no_reply_template_id?: string | null
          follow_up_delay_minutes?: number
          updated_at?: string
        }
      }
      campaign_contacts: {
        Row: {
          id: string
          campaign_id: string
          contact_id: string
          status: string
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
        Insert: {
          id?: string
          campaign_id: string
          contact_id: string
          status?: string
          current_step?: number
          email_1_sent_at?: string | null
          email_1_opened_at?: string | null
          email_1_replied_at?: string | null
          follow_up_due_at?: string | null
          follow_up_sent_at?: string | null
          replied?: boolean
          opened?: boolean
          bounced?: boolean
          unsubscribed?: boolean
          stopped?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          contact_id?: string
          status?: string
          current_step?: number
          email_1_sent_at?: string | null
          email_1_opened_at?: string | null
          email_1_replied_at?: string | null
          follow_up_due_at?: string | null
          follow_up_sent_at?: string | null
          replied?: boolean
          opened?: boolean
          bounced?: boolean
          unsubscribed?: boolean
          stopped?: boolean
          updated_at?: string
        }
      }
      email_messages: {
        Row: {
          id: string
          campaign_id: string
          contact_id: string
          campaign_contact_id: string
          step: number
          template_type: string
          sendgrid_message_id: string | null
          status: string
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          contact_id: string
          campaign_contact_id: string
          step?: number
          template_type: string
          sendgrid_message_id?: string | null
          status?: string
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          contact_id?: string
          campaign_contact_id?: string
          step?: number
          template_type?: string
          sendgrid_message_id?: string | null
          status?: string
          sent_at?: string | null
        }
      }
      email_events: {
        Row: {
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
        Insert: {
          id?: string
          email_message_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          event_type: string
          sendgrid_event_id?: string | null
          event_timestamp?: string | null
          raw_event?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          email_message_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          event_type?: string
          sendgrid_event_id?: string | null
          event_timestamp?: string | null
          raw_event?: Record<string, unknown> | null
        }
      }
      replies: {
        Row: {
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
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id?: string | null
          contact_id?: string | null
          from_email: string
          to_email?: string | null
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          message_id?: string | null
          received_at?: string
          raw_payload?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string | null
          contact_id?: string | null
          from_email?: string
          to_email?: string | null
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          message_id?: string | null
          received_at?: string
          raw_payload?: Record<string, unknown> | null
        }
      }
      campaign_logs: {
        Row: {
          id: string
          campaign_id: string
          contact_id: string | null
          level: string
          message: string
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          contact_id?: string | null
          level?: string
          message: string
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          contact_id?: string | null
          level?: string
          message?: string
          metadata?: Record<string, unknown> | null
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
