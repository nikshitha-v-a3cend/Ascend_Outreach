// src/app/api/ai/preview/route.ts
// Previews AI next-action decision and personalized email generation for testing/transparency

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { decideNextAction, generatePersonalizedEmail } from '@/lib/ai/service'
import { classifyIfNeeded } from '@/lib/ai/orchestration'
import type { Contact } from '@/lib/supabase/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      campaign_id: string
      contact_id: string
      custom_instructions?: string
      target_tone?: string
    }

    if (!body.campaign_id || !body.contact_id) {
      return Response.json({ error: 'campaign_id and contact_id are required' }, { status: 400 })
    }

    const db = getServerSupabase()

    // 1. Fetch campaign
    const { data: campaign, error: campErr } = await db
      .from('campaigns')
      .select('*')
      .eq('id', body.campaign_id)
      .single()

    if (campErr || !campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })

    // 2. Fetch contact
    const { data: contact, error: conErr } = await db
      .from('contacts')
      .select('*')
      .eq('id', body.contact_id)
      .single()

    if (conErr || !contact) return Response.json({ error: 'Contact not found' }, { status: 404 })

    // Ensure Apify web/LinkedIn research + AI classification are present — the
    // same helper the real send pipeline uses, so what's previewed here matches
    // what will actually be generated at send time.
    const contactProfile = await classifyIfNeeded(db, contact as Contact)

    // 3. Fetch campaign contact status
    const { data: cc } = await db
      .from('campaign_contacts')
      .select('*')
      .eq('campaign_id', body.campaign_id)
      .eq('contact_id', body.contact_id)
      .single()

    // 4. Fetch email history
    const { data: emailMessages } = await db
      .from('email_messages')
      .select('*')
      .eq('campaign_id', body.campaign_id)
      .eq('contact_id', body.contact_id)
      .order('step', { ascending: true })

    // 5. Fetch events
    const { data: events } = await db
      .from('email_events')
      .select('event_type, event_timestamp')
      .eq('campaign_id', body.campaign_id)
      .eq('contact_id', body.contact_id)

    // 6. Fetch replies
    const { data: replies } = await db
      .from('replies')
      .select('from_email, subject, body_text, received_at')
      .eq('contact_id', body.contact_id)

    // 7. Fetch previous AI decisions
    const { data: prevDecisions } = await db
      .from('ai_decisions')
      .select('*')
      .eq('contact_id', body.contact_id)
      .order('created_at', { ascending: false })

    // 8. Run AI Decision Engine
    const decision = await decideNextAction({
      contact: contactProfile,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        from_name: campaign.from_name,
        from_email: campaign.from_email,
        messaging_guidelines: body.custom_instructions || campaign.messaging_guidelines,
      },
      campaign_contact: {
        id: cc?.id || 'preview-cc-id',
        status: cc?.status || 'queued',
        current_step: cc?.current_step || 0,
        email_1_sent_at: cc?.email_1_sent_at,
        email_1_opened_at: cc?.email_1_opened_at,
        follow_up_sent_at: cc?.follow_up_sent_at,
        opened: cc?.opened || false,
        replied: cc?.replied || false,
        bounced: cc?.bounced || false,
      },
      email_history: (emailMessages || []).map((em) => ({
        step: em.step,
        subject: em.subject,
        body_text: em.body_text,
        sent_at: em.sent_at,
        template_type: em.template_type,
      })),
      events: events || [],
      replies: replies || [],
      previous_decisions: (prevDecisions || []).map((d) => ({
        action: d.action,
        reason: d.reason,
        strategy: d.strategy,
        created_at: d.created_at,
      })),
    })

    // 9. If decision involves generating an email, preview the generated email
    let emailPreview = null
    const sendsEmail = [
      'SEND_FIRST_EMAIL',
      'SEND_FOLLOWUP',
      'CHANGE_SUBJECT',
      'CHANGE_MESSAGING_ANGLE',
      'SEND_RELEVANT_CONTENT',
      'ASK_A_QUESTION',
      'REENGAGE_THREAD',
      'ANSWER_AND_FOLLOWUP',
    ].includes(decision.action)

    if (sendsEmail) {
      emailPreview = await generatePersonalizedEmail({
        contact: contactProfile,
        campaign: {
          name: campaign.name,
          from_name: campaign.from_name,
          from_email: campaign.from_email,
          from_title: campaign.from_title,
        },
        step: (cc?.current_step || 0) + 1,
        decision,
        custom_instructions: body.custom_instructions || campaign.custom_instructions,
        messaging_guidelines: campaign.messaging_guidelines,
        target_tone: body.target_tone || campaign.target_tone,
        previous_emails: (emailMessages || []).map((em) => ({
          step: em.step,
          subject: em.subject,
          body_text: em.body_text,
        })),
        replies_history: (replies || []).map((r) => ({
          from_email: r.from_email,
          subject: r.subject,
          body_text: r.body_text,
          received_at: r.received_at,
        })),
        interaction_summary: {
          opened_count: (events || []).filter((e) => e.event_type === 'open').length || (cc?.opened ? 1 : 0),
          last_opened_at: cc?.email_1_opened_at,
          replied: cc?.replied || false,
        },
      })
    }

    return Response.json({
      success: true,
      contact: contactProfile,
      decision,
      email_preview: emailPreview,
      history_count: emailMessages?.length || 0,
      events_count: events?.length || 0,
    })
  } catch (err: unknown) {
    console.error('[AI Preview] Error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'AI Preview failed' },
      { status: 500 }
    )
  }
}
