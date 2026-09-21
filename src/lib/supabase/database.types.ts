// src/lib/supabase/database.types.ts
// Database type definitions for Supabase JS v2
// These match the schema in supabase/migrations/001_initial_schema.sql
// and supabase/migrations/002_ai_engine.sql

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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
          linkedin_url?: string | null
          company_domain?: string | null
          department?: string | null
          industry?: string | null
          persona?: string | null
          seniority?: string | null
          role_category?: string | null
          company_category?: string | null
          relevant_use_cases?: string[] | null
          ai_profile?: Json | null
          ai_profile_updated_at?: string | null
          apify_enrichment?: Json | null
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
          linkedin_url?: string | null
          company_domain?: string | null
          department?: string | null
          industry?: string | null
          persona?: string | null
          seniority?: string | null
          role_category?: string | null
          company_category?: string | null
          relevant_use_cases?: string[] | null
          ai_profile?: Json | null
          ai_profile_updated_at?: string | null
          apify_enrichment?: Json | null
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
          linkedin_url?: string | null
          company_domain?: string | null
          department?: string | null
          industry?: string | null
          persona?: string | null
          seniority?: string | null
          role_category?: string | null
          company_category?: string | null
          relevant_use_cases?: string[] | null
          ai_profile?: Json | null
          ai_profile_updated_at?: string | null
          apify_enrichment?: Json | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          id: string
          name: string
          status: string
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
        Insert: {
          id?: string
          name: string
          status?: string
          test_mode?: boolean
          from_name: string
          from_email: string
          from_title?: string | null
          initial_template_id?: string | null
          no_open_template_id?: string | null
          opened_no_reply_template_id?: string | null
          follow_up_delay_minutes?: number
          custom_instructions?: string | null
          messaging_guidelines?: string | null
          target_tone?: string | null
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
          from_title?: string | null
          initial_template_id?: string | null
          no_open_template_id?: string | null
          opened_no_reply_template_id?: string | null
          follow_up_delay_minutes?: number
          custom_instructions?: string | null
          messaging_guidelines?: string | null
          target_tone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_decisions: {
        Row: {
          id: string
          contact_id: string
          campaign_id: string | null
          action: string
          reason: string
          strategy: string | null
          tone: string | null
          suggested_angle: string | null
          wait_minutes: number | null
          context: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          contact_id: string
          campaign_id?: string | null
          action: string
          reason: string
          strategy?: string | null
          tone?: string | null
          suggested_angle?: string | null
          wait_minutes?: number | null
          context?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          contact_id?: string
          campaign_id?: string | null
          action?: string
          reason?: string
          strategy?: string | null
          tone?: string | null
          suggested_angle?: string | null
          wait_minutes?: number | null
          context?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_decisions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          }
        ]
      }
      email_messages: {
        Row: {
          id: string
          campaign_id?: string | null
          contact_id?: string | null
          campaign_contact_id?: string | null
          step: number
          template_type: string
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          decision_id?: string | null
          personalization_context?: Json | null
          sendgrid_message_id: string | null
          status: string
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id?: string | null
          contact_id?: string | null
          campaign_contact_id?: string | null
          step?: number
          template_type: string
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          decision_id?: string | null
          personalization_context?: Json | null
          sendgrid_message_id?: string | null
          status?: string
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string | null
          contact_id?: string | null
          campaign_contact_id?: string | null
          step?: number
          template_type?: string
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          decision_id?: string | null
          personalization_context?: Json | null
          sendgrid_message_id?: string | null
          status?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_campaign_contact_id_fkey"
            columns: ["campaign_contact_id"]
            isOneToOne: false
            referencedRelation: "campaign_contacts"
            referencedColumns: ["id"]
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: "email_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: "replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replies_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: "campaign_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
