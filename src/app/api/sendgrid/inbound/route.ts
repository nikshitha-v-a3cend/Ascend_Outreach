// src/app/api/sendgrid/inbound/route.ts
// SendGrid Inbound Parse webhook — receives email replies
// When a contact replies, marks them as replied=true, stopped=true
// No automated email is ever sent in response

export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import type { Contact } from '@/lib/supabase/types'

function extractSenderEmail(from: string): string {
  // Handle formats: "John Smith <john@example.com>" or "john@example.com"
  const match = from.match(/<([^>]+)>/)
  if (match) return match[1].toLowerCase().trim()
  return from.toLowerCase().trim()
}

function cleanSubject(subject: string): string {
  // Strip Re:, Fwd:, Fw: prefixes
  return subject.replace(/^(re|fwd|fw):\s*/gi, '').trim()
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()

    const from = (formData.get('from') as string) ?? ''
    const to = (formData.get('to') as string) ?? ''
    const subject = (formData.get('subject') as string) ?? ''
    const text = (formData.get('text') as string) ?? ''
    const html = (formData.get('html') as string) ?? ''
    const messageId = (formData.get('headers') as string)?.match(/Message-ID:\s*<([^>]+)>/i)?.[1] ?? null

    if (!from) {
      return new Response('Missing from address', { status: 400 })
    }

    const senderEmail = extractSenderEmail(from)
    const db = getServerSupabase()

    // 1. If sent by our team member to a prospect, log manual reply and schedule re-engagement
    if (senderEmail.endsWith('@a3cend.com')) {
      const recipientEmail = extractSenderEmail(to)
      const { data: recipientContact } = await db
        .from('contacts')
        .select('*')
        .eq('email', recipientEmail)
        .single()

      if (recipientContact) {
        const { data: cc } = await db
          .from('campaign_contacts')
          .select('id, campaign_id, status')
          .eq('contact_id', recipientContact.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (cc) {
          const { data: camp } = await db
            .from('campaigns')
            .select('follow_up_delay_minutes')
            .eq('id', cc.campaign_id)
            .single()

          const delayMinutes = camp?.follow_up_delay_minutes || 5
          const nextDue = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()

          await db
            .from('campaign_contacts')
            .update({
              status: 'manual_reply_sent',
              stopped: false,
              replied: false,
              follow_up_due_at: nextDue,
            })
            .eq('id', cc.id)

          await db.from('campaign_logs').insert({
            campaign_id: cc.campaign_id,
            contact_id: recipientContact.id,
            level: 'info',
            message: `Team manual reply detected from ${senderEmail} to ${recipientEmail} — automated re-engagement follow-up scheduled if prospect does not respond`,
            metadata: { subject: cleanSubject(subject), next_due: nextDue },
          })

          return new Response('OK', { status: 200 })
        }
      }
    }

    // 2. Find matching contact by sender email (prospect reply)
    const { data: contact } = await db
      .from('contacts')
      .select('*')
      .eq('email', senderEmail)
      .single()

    let campaignId: string | null = null
    const contactId: string | null = contact?.id ?? null

    // If we found the contact, find their active campaign
    if (contactId) {
      const { data: cc } = await db
        .from('campaign_contacts')
        .select('id, campaign_id, replied, stopped, status')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (cc) {
        campaignId = cc.campaign_id

        // Mark as replied & stop all automated followups (idempotent, or if was awaiting in manual_reply_sent)
        if (!cc.replied || cc.status === 'manual_reply_sent') {
          await db
            .from('campaign_contacts')
            .update({
              replied: true,
              stopped: true,
              status: 'replied',
              email_1_replied_at: new Date().toISOString(),
            })
            .eq('id', cc.id)

          await db.from('campaign_logs').insert({
            campaign_id: cc.campaign_id,
            contact_id: contactId,
            level: 'info',
            message: `Reply received from ${senderEmail} — future follow-ups stopped`,
            metadata: { subject: cleanSubject(subject) },
          })

          console.log('[Inbound] Reply processed:', {
            contact_id: contactId,
            campaign_id: cc.campaign_id,
            sender_masked: senderEmail.replace(/(.{2}).+(@.+)/, '$1***$2'),
          })
        }
      }
    } else {
      console.warn('[Inbound] Reply from unknown sender:', {
        sender_masked: senderEmail.replace(/(.{2}).+(@.+)/, '$1***$2'),
      })
    }

    // Analyze reply intent and sentiment via AI
    let replyAnalysis = null
    try {
      const { analyzeReply } = await import('@/lib/ai/service')
      replyAnalysis = await analyzeReply({
        reply: {
          id: '',
          campaign_id: campaignId,
          contact_id: contactId,
          from_email: senderEmail,
          to_email: to,
          subject,
          body_text: text,
          body_html: html,
          message_id: messageId,
          received_at: new Date().toISOString(),
          raw_payload: null,
          created_at: new Date().toISOString(),
        },
        contact: contact as unknown as Contact | null,
      })
    } catch (aiErr) {
      console.warn('[Inbound] AI reply analysis skipped:', aiErr)
    }

    // Always store the reply record with AI analysis
    await db.from('replies').insert({
      campaign_id: campaignId,
      contact_id: contactId,
      from_email: senderEmail,
      to_email: to || null,
      subject: subject || null,
      body_text: text || null,
      body_html: html || null,
      message_id: messageId,
      received_at: new Date().toISOString(),
      raw_payload: {
        from,
        to,
        subject,
        message_id: messageId,
        ai_intent: replyAnalysis?.intent,
        ai_sentiment: replyAnalysis?.sentiment,
        ai_summary: replyAnalysis?.summary,
        suggested_action: replyAnalysis?.suggested_action,
      },
    })

    if (replyAnalysis && contactId) {
      await db.from('ai_decisions').insert({
        contact_id: contactId,
        campaign_id: campaignId,
        action: replyAnalysis.suggested_action || 'HAND_TO_HUMAN',
        reason: `Inbound Reply [Intent: ${replyAnalysis.intent}, Sentiment: ${replyAnalysis.sentiment}]: ${replyAnalysis.summary}`,
        strategy: 'Inbound Response Handling',
        context: { reply_snippet: text.slice(0, 200) },
      })
    }

    // Automatically alert the sales team / campaign owner about the new reply
    try {
      const { sendEmail } = await import('@/lib/sendgrid/client')
      const sukenduNotificationEmail = process.env.SALES_NOTIFICATION_EMAIL || 'sukendu.maji@a3cend.com'
      const contactInfo = contact as { first_name?: string; last_name?: string; company?: string; designation?: string; email?: string } | null
      const contactName = contactInfo?.first_name ? `${contactInfo.first_name} ${contactInfo.last_name || ''}`.trim() : senderEmail

      const notificationHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <div style="background: #028097; color: #ffffff; padding: 16px 20px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0; font-size: 18px;">🔥 New Reply Received — A3CEND Outreach</h2>
          </div>
          <div style="padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; background: #ffffff;">
            <p style="font-size: 14px; margin-top: 0;"><strong>${contactName}</strong> from <strong>${contactInfo?.company || 'Prospect Organization'}</strong> (${contactInfo?.designation || 'Leader'}) has replied to an outreach campaign.</p>
            
            <div style="background: #f8fafc; border-left: 4px solid #028097; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
              <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748b;"><strong>Subject:</strong> ${cleanSubject(subject)}</p>
              <p style="margin: 0; font-size: 14px; color: #0f172a; white-space: pre-wrap;">${text || '(HTML reply received)'}</p>
            </div>

            ${replyAnalysis ? `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
              <div style="font-size: 12px; font-weight: 700; color: #166534; text-transform: uppercase;">AI Reply Analysis</div>
              <div style="font-size: 13px; color: #15803d; margin-top: 4px;"><strong>Intent:</strong> ${replyAnalysis.intent} | <strong>Sentiment:</strong> ${replyAnalysis.sentiment}</div>
              <div style="font-size: 13px; color: #334155; margin-top: 4px;"><strong>Summary:</strong> ${replyAnalysis.summary}</div>
            </div>
            ` : ''}

            <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">
              Automated follow-ups have been <strong>permanently stopped</strong> for this contact so the sales team can handle the conversation directly.
            </p>
          </div>
        </div>
      `

      await sendEmail({
        to: sukenduNotificationEmail,
        fromEmail: process.env.SENDGRID_FROM_EMAIL || 'nikshitha.v@a3cend.com',
        fromName: 'A3CEND Outreach Bot',
        subject: `[Lead Reply] ${contactName} from ${contactInfo?.company || senderEmail}: "${cleanSubject(subject)}"`,
        html: notificationHtml,
        text: `New Reply from ${contactName} (${senderEmail}):\n\n${text}\n\nAutomated follow-ups have been stopped.`,
      })
    } catch (notifyErr) {
      console.warn('[Inbound] Failed to dispatch sales team notification email:', notifyErr)
    }

    // Must return 200 to prevent SendGrid retries
    return new Response('OK', { status: 200 })
  } catch (err: unknown) {
    console.error('[Inbound] Error processing reply:', err)
    // Still return 200 to avoid SendGrid retry storms
    return new Response('OK', { status: 200 })
  }
}
