// src/app/api/campaigns/[id]/sync-sendgrid/route.ts
// Syncs email opens and delivery events directly from SendGrid Activity API
// Solves localhost / webhook-delay issues by pulling verified stats directly from SendGrid

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

export const runtime = 'nodejs'

interface SendGridMessage {
  from_email: string
  msg_id: string
  subject: string
  to_email: string
  status: string
  opens_count: number
  clicks_count: number
  last_event_time: string
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await context.params
  const apiKey = process.env.SENDGRID_API_KEY

  if (!apiKey) {
    return Response.json({ error: 'SENDGRID_API_KEY not configured' }, { status: 500 })
  }

  const db = getServerSupabase()

  // 1. Get all contacts in this campaign (with sent timestamp for time-filtering)
  const { data: campaignContacts, error: ccErr } = await db
    .from('campaign_contacts')
    .select('id, contact_id, status, opened, replied, stopped, email_1_sent_at, email_1_opened_at, contacts(id, email, first_name, last_name)')
    .eq('campaign_id', campaignId)
    .eq('replied', false)   // skip already-replied contacts
    .eq('stopped', false)   // skip stopped contacts
    .not('email_1_sent_at', 'is', null) // only contacts where email was actually sent

  if (ccErr || !campaignContacts) {
    return Response.json({ error: ccErr?.message ?? 'Campaign contacts not found' }, { status: 404 })
  }

  if (campaignContacts.length === 0) {
    return Response.json({ success: true, message: 'No eligible contacts to sync (all replied or not yet sent).', updatedContactsCount: 0 })
  }

  // Find the earliest sent_at across all contacts — use this as the time boundary for SendGrid query
  const earliestSentAt = campaignContacts
    .map(cc => cc.email_1_sent_at!)
    .sort()[0]

  // 2. Fetch recent messages from SendGrid Activity API (filtered by send date)
  // Only pull messages sent on or after the earliest email in this campaign
  const startDate = new Date(earliestSentAt).toISOString()
  let messages: SendGridMessage[] = []
  try {
    const sgRes = await fetch(
      `https://api.sendgrid.com/v3/messages?limit=100&query=last_event_time%20BETWEEN%20TIMESTAMP%20%22${encodeURIComponent(startDate)}%22%20AND%20TIMESTAMP%20%22${encodeURIComponent(new Date().toISOString())}%22`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )

    if (sgRes.ok) {
      const data = (await sgRes.json()) as { messages?: SendGridMessage[] }
      messages = data.messages ?? []
    } else {
      // Fallback: fetch without date filter if query fails
      const fallbackRes = await fetch('https://api.sendgrid.com/v3/messages?limit=100', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (fallbackRes.ok) {
        const data = (await fallbackRes.json()) as { messages?: SendGridMessage[] }
        messages = data.messages ?? []
      } else {
        const errText = await fallbackRes.text()
        return Response.json({ error: `SendGrid API error: ${errText}` }, { status: 502 })
      }
    }
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : 'Failed to reach SendGrid API' }, { status: 502 })
  }

  // 3. Map opens from SendGrid messages to campaign contacts
  // KEY FIX: Only match messages sent AFTER this campaign's email_1_sent_at
  // This prevents old campaign messages from polluting new campaign data
  let updatedCount = 0
  const updatedEmails: string[] = []

  for (const cc of campaignContacts) {
    const contact = Array.isArray(cc.contacts) ? cc.contacts[0] : cc.contacts
    if (!contact?.email) continue

    const recipientEmail = contact.email.toLowerCase()
    // Use the contact's actual sent time as the cutoff — only opens AFTER this email was sent count
    const sentCutoff = new Date(cc.email_1_sent_at!).getTime()

    // Find SendGrid messages for this contact, sent AFTER this campaign's email
    const matchingMsgs = messages.filter(
      (m) =>
        m.to_email &&
        m.to_email.toLowerCase() === recipientEmail &&
        new Date(m.last_event_time).getTime() >= sentCutoff // ← CRITICAL: only this campaign's messages
    )

    const totalOpens = matchingMsgs.reduce((acc, m) => acc + (m.opens_count || 0), 0)
    const openMsgs = matchingMsgs.filter((m) => (m.opens_count || 0) > 0)
    openMsgs.sort((a, b) => new Date(b.last_event_time).getTime() - new Date(a.last_event_time).getTime())
    const latestOpenMsg = openMsgs[0]

    if (totalOpens > 0) {
      const openTimestamp = latestOpenMsg?.last_event_time || new Date().toISOString()
      const needsUpdate = !cc.opened || cc.email_1_opened_at !== openTimestamp

      if (needsUpdate) {
        type CCUpdate = Database['public']['Tables']['campaign_contacts']['Update']
        const updateData: CCUpdate = {
          opened: true,
          email_1_opened_at: openTimestamp,
        }
        if (cc.status === 'sent' || cc.status === 'queued') {
          updateData.status = 'opened'
        }

        await db.from('campaign_contacts').update(updateData).eq('id', cc.id)

      await db.from('email_events').insert({
        campaign_id: campaignId,
        contact_id: cc.contact_id,
        event_type: 'open',
        event_timestamp: openTimestamp,
        raw_event: {
          source: 'sendgrid_api_sync',
          total_opens: totalOpens,
          msg_id: latestOpenMsg?.msg_id,
        },
      })

      await db.from('campaign_logs').insert({
        campaign_id: campaignId,
        contact_id: cc.contact_id,
        level: 'info',
        message: `Email opened (${totalOpens} open${totalOpens > 1 ? 's' : ''} recorded in SendGrid)`,
        metadata: {
          event_type: 'open',
          timestamp: openTimestamp,
          opens_count: totalOpens,
        },
      })

      updatedCount++
      updatedEmails.push(contact.email)
    }
  }
}

  return Response.json({
    success: true,
    totalSendGridMessages: messages.length,
    updatedContactsCount: updatedCount,
    updatedEmails,
    message:
      updatedCount > 0
        ? `Synced ${updatedCount} open event(s) directly from SendGrid (${updatedEmails.join(', ')})!`
        : 'All contacts are up to date with SendGrid.',
  })
}
