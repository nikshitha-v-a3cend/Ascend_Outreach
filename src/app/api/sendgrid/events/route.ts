// src/app/api/sendgrid/events/route.ts
// SendGrid Event Webhook handler
// Receives delivery/open/click/bounce/unsubscribe/spam events
// All processing is IDEMPOTENT — same event ID never processed twice

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

// Tell Next.js to use Node.js runtime (not Edge) for DB access
export const runtime = 'nodejs'

interface SendGridEvent {
  sg_event_id?: string
  sg_message_id?: string
  event: string
  email?: string
  timestamp?: number
  campaign_id?: string
  contact_id?: string
  campaign_contact_id?: string
  sequence_step?: string
  [key: string]: unknown
}

async function processEvent(db: ReturnType<typeof import('@/lib/supabase/server').getServerSupabase>, event: SendGridEvent) {
  const {
    sg_event_id,
    sg_message_id,
    event: eventType,
    timestamp,
    campaign_id,
    contact_id,
    campaign_contact_id,
    sequence_step,
    ...rest
  } = event

  // 1. Idempotency: skip if we've already processed this event
  if (sg_event_id) {
    const { data: existing } = await db
      .from('email_events')
      .select('id')
      .eq('sendgrid_event_id', sg_event_id)
      .single()

    if (existing) {
      console.log('[Events] Duplicate event skipped:', { sg_event_id, event_type: eventType })
      return
    }
  }

  const eventTimestamp = timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString()

  // 2. Resolve email_message record using sg_message_id or custom_args
  let emailMessageId: string | null = null
  let resolvedCampaignId: string | null = campaign_id ?? null
  let resolvedContactId: string | null = contact_id ?? null

  // Try matching by sendgrid_message_id first (most reliable)
  if (sg_message_id) {
    const cleanMsgId = sg_message_id.split('.')[0] // strip filter server suffix
    const { data: msgRecord } = await db
      .from('email_messages')
      .select('id, campaign_id, contact_id, campaign_contact_id')
      .or(`sendgrid_message_id.eq.${sg_message_id},sendgrid_message_id.eq.${cleanMsgId}`)
      .single()

    if (msgRecord) {
      emailMessageId = msgRecord.id
      resolvedCampaignId = resolvedCampaignId ?? msgRecord.campaign_id
      resolvedContactId = resolvedContactId ?? msgRecord.contact_id
    }
  }

  // Fallback: use custom_args (campaign_id + contact_id + sequence_step)
  if (!emailMessageId && campaign_id && contact_id && sequence_step) {
    const { data: msgRecord } = await db
      .from('email_messages')
      .select('id, campaign_id, contact_id, campaign_contact_id')
      .eq('campaign_id', campaign_id)
      .eq('contact_id', contact_id)
      .eq('step', parseInt(sequence_step))
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (msgRecord) {
      emailMessageId = msgRecord.id
    }
  }

  // 3. Store event record
  await db.from('email_events').insert({
    email_message_id: emailMessageId,
    campaign_id: resolvedCampaignId,
    contact_id: resolvedContactId,
    event_type: eventType,
    sendgrid_event_id: sg_event_id ?? null,
    event_timestamp: eventTimestamp,
    raw_event: { event: eventType, sg_message_id, timestamp, sequence_step, ...rest },
  })

  // 4. Update campaign_contact state based on event type
  const ccId = campaign_contact_id

  // Find the campaign_contact to update
  const findCC = async () => {
    if (ccId) {
      const { data } = await db.from('campaign_contacts').select('*').eq('id', ccId).single()
      return data
    }
    if (resolvedCampaignId && resolvedContactId) {
      const { data } = await db
        .from('campaign_contacts')
        .select('*')
        .eq('campaign_id', resolvedCampaignId)
        .eq('contact_id', resolvedContactId)
        .single()
      return data
    }
    return null
  }

  const cc = await findCC()

  if (!cc) {
    console.warn('[Events] Could not resolve campaign_contact for event:', { event_type: eventType, sg_event_id })
    return
  }

  switch (eventType) {
    case 'open': {
      const updates: Record<string, unknown> = { opened: true }
      if (!cc.email_1_opened_at) {
        updates.email_1_opened_at = eventTimestamp
        updates.status = 'opened'
      }
      await db.from('campaign_contacts').update(updates).eq('id', cc.id)
      await db.from('campaign_logs').insert({
        campaign_id: cc.campaign_id,
        contact_id: cc.contact_id,
        level: 'info',
        message: 'Email opened',
        metadata: { event_type: eventType, timestamp: eventTimestamp },
      })
      break
    }

    case 'bounce':
    case 'blocked': {
      if (!cc.bounced) {
        await db.from('campaign_contacts').update({
          bounced: true,
          stopped: true,
          status: 'bounced',
        }).eq('id', cc.id)
        await db.from('campaign_logs').insert({
          campaign_id: cc.campaign_id,
          contact_id: cc.contact_id,
          level: 'warn',
          message: `Email bounced (${eventType})`,
          metadata: { event_type: eventType },
        })
      }
      break
    }

    case 'unsubscribe':
    case 'group_unsubscribe': {
      if (!cc.unsubscribed) {
        await db.from('campaign_contacts').update({
          unsubscribed: true,
          stopped: true,
          status: 'unsubscribed',
        }).eq('id', cc.id)
        await db.from('campaign_logs').insert({
          campaign_id: cc.campaign_id,
          contact_id: cc.contact_id,
          level: 'info',
          message: 'Contact unsubscribed',
          metadata: { event_type: eventType },
        })
      }
      break
    }

    case 'spamreport': {
      if (!cc.stopped) {
        await db.from('campaign_contacts').update({
          stopped: true,
          status: 'stopped',
        }).eq('id', cc.id)
        await db.from('campaign_logs').insert({
          campaign_id: cc.campaign_id,
          contact_id: cc.contact_id,
          level: 'warn',
          message: 'Spam report — future emails stopped',
          metadata: { event_type: eventType },
        })
      }
      break
    }

    case 'delivered': {
      // Update message status if not already sent
      if (emailMessageId) {
        await db.from('email_messages').update({ status: 'sent' }).eq('id', emailMessageId).eq('status', 'pending')
      }
      break
    }

    default:
      // processed, click, deferred — log only, no state change
      break
  }
}

export async function POST(req: NextRequest) {
  try {
    const text = await req.text()
    let events: SendGridEvent[]

    try {
      events = JSON.parse(text)
      if (!Array.isArray(events)) events = [events]
    } catch {
      return new Response('Invalid JSON', { status: 400 })
    }

    const db = getServerSupabase()

    // Process all events (in sequence to avoid race conditions)
    for (const event of events) {
      try {
        await processEvent(db, event)
      } catch (err: unknown) {
        console.error('[Events] Error processing event:', {
          event_type: event.event,
          sg_event_id: event.sg_event_id,
          error: err instanceof Error ? err.message : 'unknown',
        })
        // Don't fail the whole batch for one bad event
      }
    }

    // SendGrid requires 200 response to stop retrying
    return new Response('OK', { status: 200 })
  } catch (err: unknown) {
    console.error('[Events] Unexpected error:', err)
    return new Response('Internal error', { status: 500 })
  }
}
