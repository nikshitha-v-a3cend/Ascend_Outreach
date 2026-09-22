// src/app/api/ai/send/route.ts
// Directly sends an individual AI-generated or custom-edited email to a contact

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { sendEmail, buildOutreachReplyTo } from '@/lib/sendgrid/client'
import { decideNextAction, generatePersonalizedEmail } from '@/lib/ai/service'
import { classifyIfNeeded } from '@/lib/ai/orchestration'
import type { Contact } from '@/lib/supabase/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      campaign_id: string
      contact_id: string
      custom_subject?: string
      custom_body?: string
      custom_html?: string
      custom_instructions?: string
      target_tone?: string
    }

    if (!body.campaign_id || !body.contact_id) {
      return Response.json({ error: 'campaign_id and contact_id are required' }, { status: 400 })
    }

    const db = getServerSupabase()

    // 1. Fetch Campaign
    const { data: campaign, error: campErr } = await db
      .from('campaigns')
      .select('*')
      .eq('id', body.campaign_id)
      .single()

    if (campErr || !campaign) {
      return Response.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // 2. Fetch Contact
    const { data: contact, error: conErr } = await db
      .from('contacts')
      .select('*')
      .eq('id', body.contact_id)
      .single()

    if (conErr || !contact) {
      return Response.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Ensure Apify web/LinkedIn research + AI classification are present before
    // generating this email — same helper the automated sequence uses.
    const contactProfile = await classifyIfNeeded(db, contact as Contact)

    // 3. Fetch or create Campaign Contact record
    let { data: cc } = await db
      .from('campaign_contacts')
      .select('*')
      .eq('campaign_id', body.campaign_id)
      .eq('contact_id', body.contact_id)
      .single()

    if (!cc) {
      const { data: newCC, error: newCCErr } = await db
        .from('campaign_contacts')
        .insert({
          campaign_id: body.campaign_id,
          contact_id: body.contact_id,
          status: 'queued',
          current_step: 0,
        })
        .select()
        .single()
      if (newCCErr) return Response.json({ error: 'Failed to enroll contact' }, { status: 500 })
      cc = newCC
    }

    // 4. Fetch email history, events, replies, and decisions
    const { data: emailMessages } = await db
      .from('email_messages')
      .select('*')
      .eq('campaign_id', body.campaign_id)
      .eq('contact_id', body.contact_id)
      .order('step', { ascending: true })

    const { data: events } = await db
      .from('email_events')
      .select('event_type, event_timestamp')
      .eq('campaign_id', body.campaign_id)
      .eq('contact_id', body.contact_id)

    const { data: replies } = await db
      .from('replies')
      .select('from_email, subject, body_text, received_at')
      .eq('contact_id', body.contact_id)

    const { data: prevDecisions } = await db
      .from('ai_decisions')
      .select('*')
      .eq('contact_id', body.contact_id)
      .order('created_at', { ascending: false })

    const hasReplied = cc.replied || Boolean(replies && replies.length > 0)
    const isStopped = cc.stopped || hasReplied

    // Safety checks
    if (hasReplied || cc.bounced || cc.unsubscribed || isStopped) {
      if (hasReplied && !cc.replied) {
        await db.from('campaign_contacts').update({ replied: true, stopped: true, status: 'replied' }).eq('id', cc.id)
      }
      return Response.json(
        { error: `Cannot send email: Contact is marked as ${hasReplied ? 'replied' : cc.bounced ? 'bounced' : cc.unsubscribed ? 'unsubscribed' : 'stopped'}` },
        { status: 400 }
      )
    }

    // 5. Resolve Email Copy
    let subject = body.custom_subject
    let bodyText = body.custom_body
    let bodyHtml = body.custom_html
    let decisionId: string | null = null

    if (!subject || !bodyText) {
      // Generate via AI
      const decision = await decideNextAction({
        contact: contactProfile,
        campaign: {
          id: campaign.id,
          name: campaign.name,
          from_name: campaign.from_name,
          from_email: campaign.from_email,
          messaging_guidelines: campaign.messaging_guidelines || undefined,
        },
        campaign_contact: {
          id: cc.id,
          status: cc.status,
          current_step: cc.current_step,
          opened: cc.opened,
          replied: cc.replied,
          bounced: cc.bounced,
        },
        email_history: (emailMessages || []).map((m) => ({
          step: m.step,
          subject: m.subject,
          body_text: m.body_text,
          sent_at: m.sent_at,
          template_type: m.template_type,
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

      const { data: decRecord } = await db
        .from('ai_decisions')
        .insert({
          contact_id: contact.id,
          campaign_id: campaign.id,
          action: decision.action || 'SEND_FIRST_EMAIL',
          reason: decision.reason || 'AI Individual Dispatch',
          strategy: decision.strategy,
          tone: body.target_tone || decision.tone,
          suggested_angle: decision.suggested_angle,
          context: { custom_instructions: body.custom_instructions },
        })
        .select('id')
        .single()

      decisionId = decRecord?.id ?? null

      const generated = await generatePersonalizedEmail({
        contact: contactProfile,
        campaign: {
          name: campaign.name,
          from_name: campaign.from_name,
          from_email: campaign.from_email,
          from_title: campaign.from_title,
        },
        step: Math.max(cc.current_step + 1, 1),
        decision,
        custom_instructions: body.custom_instructions,
        target_tone: body.target_tone,
        previous_emails: (emailMessages || []).map((m) => ({
          step: m.step,
          subject: m.subject,
          body_text: m.body_text,
        })),
        replies_history: (replies || []).map((r) => ({
          from_email: r.from_email,
          subject: r.subject,
          body_text: r.body_text,
          received_at: r.received_at,
        })),
        interaction_summary: {
          opened_count: (events || []).filter((e) => e.event_type === 'open').length || (cc.opened ? 1 : 0),
          last_opened_at: cc.email_1_opened_at,
          replied: hasReplied,
        },
      })

      subject = generated.subject
      bodyText = generated.body_text
      bodyHtml = generated.body_html
    }

    if (!bodyHtml && bodyText) {
      bodyHtml = `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">${bodyText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</div>`
    }

    // 5. Create email_messages record
    const nextStep = Math.max(cc.current_step + 1, 1)
    const { data: msgRecord } = await db
      .from('email_messages')
      .insert({
        campaign_id: campaign.id,
        contact_id: contact.id,
        campaign_contact_id: cc.id,
        step: nextStep,
        template_type: 'ai_personalized',
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        decision_id: decisionId,
        status: 'pending',
      })
      .select()
      .single()

    // 6. Send via SendGrid
    const sendResult = await sendEmail({
      to: contact.email,
      fromEmail: campaign.from_email,
      fromName: campaign.from_name,
      replyTo: buildOutreachReplyTo(campaign.from_email),
      subject: subject!,
      html: bodyHtml,
      text: bodyText,
      customArgs: {
        campaign_id: campaign.id,
        contact_id: contact.id,
        campaign_contact_id: cc.id,
        sequence_step: String(nextStep),
      },
    })

    if (!sendResult.success) {
      if (msgRecord) {
        await db.from('email_messages').update({ status: 'failed' }).eq('id', msgRecord.id)
      }
      return Response.json({ error: `SendGrid error: ${sendResult.error}` }, { status: 502 })
    }

    // 7. Update status and schedule follow-up
    const now = new Date()
    const delayMs = (campaign.follow_up_delay_minutes || 5) * 60 * 1000
    const followUpDue = new Date(now.getTime() + delayMs)

    if (msgRecord) {
      await db
        .from('email_messages')
        .update({
          status: 'sent',
          sendgrid_message_id: sendResult.messageId ?? null,
          sent_at: now.toISOString(),
        })
        .eq('id', msgRecord.id)
    }

    await db
      .from('campaign_contacts')
      .update({
        status: nextStep === 1 ? 'sent' : 'follow_up_sent',
        current_step: nextStep,
        email_1_sent_at: cc.email_1_sent_at || now.toISOString(),
        follow_up_sent_at: nextStep > 1 ? now.toISOString() : cc.follow_up_sent_at,
        follow_up_due_at: followUpDue.toISOString(),
      })
      .eq('id', cc.id)

    // Log success
    await db.from('campaign_logs').insert({
      campaign_id: campaign.id,
      contact_id: contact.id,
      level: 'info',
      message: `AI Email #${nextStep} sent to ${contact.email}: "${subject}"`,
      metadata: {
        subject,
        message_id: sendResult.messageId,
        decision_id: decisionId,
        follow_up_due_at: followUpDue.toISOString(),
      },
    })

    return Response.json({
      success: true,
      message: `Email #${nextStep} successfully sent to ${contact.email}!`,
      subject,
      recipient: contact.email,
      message_id: sendResult.messageId,
      follow_up_due_at: followUpDue.toISOString(),
    })
  } catch (err: unknown) {
    console.error('[AI Send] Error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to send email' },
      { status: 500 }
    )
  }
}
