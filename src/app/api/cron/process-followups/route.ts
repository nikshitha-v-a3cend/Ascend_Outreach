// src/app/api/cron/process-followups/route.ts
// Follow-up processor: called by a cron job every N minutes
// Safe against concurrent execution via atomic DB status update
// Priority order per amended plan:
//   1. Campaign must be active (not paused/stopped)
//   2. Contact: replied → STOP
//   3. Contact: unsubscribed → STOP
//   4. Contact: bounced → STOP
//   5. Contact: already sent follow-up → SKIP
//   6. Contact: opened=true → send OPENED_NO_REPLY template
//   7. Contact: opened=false → send NO_OPEN template

export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/sendgrid/client'
import type { TemplateType } from '@/lib/supabase/types'

export async function POST(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServerSupabase()
  const now = new Date().toISOString()

  const results = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  }

  try {
    // Step 1: Get all ACTIVE campaigns (not paused, not stopped)
    const { data: activeCampaigns } = await db
      .from('campaigns')
      .select('id, from_email, from_name, no_open_template_id, opened_no_reply_template_id, follow_up_delay_minutes')
      .eq('status', 'active')

    if (!activeCampaigns || activeCampaigns.length === 0) {
      return Response.json({ ...results, message: 'No active campaigns' })
    }

    const activeCampaignIds = activeCampaigns.map((c) => c.id)
    const campaignMap = Object.fromEntries(activeCampaigns.map((c) => [c.id, c]))

    // Step 2: Find campaign_contacts that are due for follow-up
    // Use atomic update to claim records and prevent double-processing
    // Only select contacts where:
    //   - campaign is active (checked above via in())
    //   - stopped=false, replied=false, bounced=false, unsubscribed=false
    //   - follow_up_due_at is in the past
    //   - follow_up_sent_at is null (not already sent)
    //   - current_step = 1 (Email #1 was sent, follow-up not yet sent)
    const { data: dueCCs } = await db
      .from('campaign_contacts')
      .select(`
        id, campaign_id, contact_id, opened, replied, bounced, unsubscribed, stopped,
        follow_up_due_at, follow_up_sent_at, current_step, status
      `)
      .in('campaign_id', activeCampaignIds)
      .eq('stopped', false)
      .eq('replied', false)
      .eq('bounced', false)
      .eq('unsubscribed', false)
      .is('follow_up_sent_at', null)
      .eq('current_step', 1)
      .lte('follow_up_due_at', now)
      .not('follow_up_due_at', 'is', null)
      .limit(100) // Process max 100 at a time

    if (!dueCCs || dueCCs.length === 0) {
      return Response.json({ ...results, message: 'No follow-ups due' })
    }

    // Step 3: Process each due contact
    for (const cc of dueCCs) {
      results.processed++

      const campaign = campaignMap[cc.campaign_id]
      if (!campaign) {
        results.skipped++
        continue
      }

      // Atomic claim: try to update status to 'follow_up_sending'
      // This prevents double-sending if two cron instances run concurrently
      const { data: claimed, error: claimErr } = await db
        .from('campaign_contacts')
        .update({ status: 'follow_up_sending' })
        .eq('id', cc.id)
        .eq('current_step', 1) // must still be step 1
        .is('follow_up_sent_at', null) // must not already have been sent
        .eq('stopped', false) // must not be stopped
        .select('id')
        .single()

      if (claimErr || !claimed) {
        // Another process already claimed this record
        results.skipped++
        continue
      }

      // Re-check reply/bounce/unsubscribe after claiming (safety check)
      const { data: freshCC } = await db
        .from('campaign_contacts')
        .select('replied, bounced, unsubscribed, stopped, opened')
        .eq('id', cc.id)
        .single()

      if (!freshCC || freshCC.replied || freshCC.bounced || freshCC.unsubscribed || freshCC.stopped) {
        // Reset status
        await db.from('campaign_contacts').update({ status: 'sent' }).eq('id', cc.id)
        results.skipped++
        continue
      }

      // Determine which template to send
      const templateType: TemplateType = freshCC.opened ? 'opened_no_reply' : 'no_open'
      const templateId = freshCC.opened
        ? campaign.opened_no_reply_template_id
        : campaign.no_open_template_id

      if (!templateId) {
        await db.from('campaign_contacts').update({ status: 'sent' }).eq('id', cc.id)
        await db.from('campaign_logs').insert({
          campaign_id: cc.campaign_id,
          contact_id: cc.contact_id,
          level: 'warn',
          message: `Follow-up skipped: ${templateType} template ID not configured`,
        })
        results.skipped++
        continue
      }

      // Load contact data for personalization
      const { data: contact } = await db
        .from('contacts')
        .select('first_name, last_name, email, company, designation')
        .eq('id', cc.contact_id)
        .single()

      if (!contact) {
        await db.from('campaign_contacts').update({ status: 'sent' }).eq('id', cc.id)
        results.skipped++
        continue
      }

      // Create email_messages record
      const { data: msgRecord } = await db
        .from('email_messages')
        .insert({
          campaign_id: cc.campaign_id,
          contact_id: cc.contact_id,
          campaign_contact_id: cc.id,
          step: 2,
          template_type: templateType,
          status: 'pending',
        })
        .select()
        .single()

      // Send follow-up email
      const sendResult = await sendEmail({
        to: contact.email,
        fromEmail: campaign.from_email,
        fromName: campaign.from_name,
        templateId,
        dynamicTemplateData: {
          firstName: contact.first_name,
          lastName: contact.last_name ?? '',
          email: contact.email,
          company: contact.company ?? '',
          designation: contact.designation ?? '',
        },
        customArgs: {
          campaign_id: cc.campaign_id,
          contact_id: cc.contact_id,
          campaign_contact_id: cc.id,
          sequence_step: '2',
        },
      })

      const sentAt = new Date().toISOString()

      if (sendResult.success) {
        // Update message record
        if (msgRecord) {
          await db.from('email_messages').update({
            status: 'sent',
            sendgrid_message_id: sendResult.messageId ?? null,
            sent_at: sentAt,
          }).eq('id', msgRecord.id)
        }

        // Update campaign_contact
        await db.from('campaign_contacts').update({
          current_step: 2,
          follow_up_sent_at: sentAt,
          status: 'follow_up_sent',
        }).eq('id', cc.id)

        await db.from('campaign_logs').insert({
          campaign_id: cc.campaign_id,
          contact_id: cc.contact_id,
          level: 'info',
          message: `Follow-up sent (${templateType})`,
          metadata: { template_type: templateType, message_id: sendResult.messageId },
        })

        results.sent++
      } else {
        // Failure: revert to sent status, log error
        if (msgRecord) {
          await db.from('email_messages').update({ status: 'failed' }).eq('id', msgRecord.id)
        }

        await db.from('campaign_contacts').update({ status: 'sent' }).eq('id', cc.id)

        await db.from('campaign_logs').insert({
          campaign_id: cc.campaign_id,
          contact_id: cc.contact_id,
          level: 'error',
          message: `Follow-up failed: ${sendResult.error}`,
          metadata: { error: sendResult.error, status_code: sendResult.statusCode },
        })

        results.failed++
      }
    }

    console.log('[Cron] Follow-up processing complete:', results)

    return Response.json({
      success: true,
      ...results,
      timestamp: now,
    })
  } catch (err: unknown) {
    console.error('[Cron] Unexpected error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Cron failed' },
      { status: 500 }
    )
  }
}

// Also support GET for simple health check / manual trigger
export async function GET(req: NextRequest) {
  return POST(req)
}
