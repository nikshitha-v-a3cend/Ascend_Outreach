// src/app/api/sendgrid/inbound/route.ts
// SendGrid Inbound Parse webhook — receives email replies
// When a contact replies, marks them as replied=true, stopped=true
// No automated email is ever sent in response

export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

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

    // Find matching contact by sender email
    const { data: contact } = await db
      .from('contacts')
      .select('id')
      .eq('email', senderEmail)
      .single()

    let campaignId: string | null = null
    const contactId: string | null = contact?.id ?? null

    // If we found the contact, find their active campaign
    if (contactId) {
      const { data: cc } = await db
        .from('campaign_contacts')
        .select('id, campaign_id, replied, stopped')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (cc) {
        campaignId = cc.campaign_id

        // Mark as replied (idempotent)
        if (!cc.replied) {
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

    // Always store the reply record
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
      },
    })

    // Must return 200 to prevent SendGrid retries
    return new Response('OK', { status: 200 })
  } catch (err: unknown) {
    console.error('[Inbound] Error processing reply:', err)
    // Still return 200 to avoid SendGrid retry storms
    return new Response('OK', { status: 200 })
  }
}
