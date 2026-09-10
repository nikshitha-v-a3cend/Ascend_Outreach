// src/app/api/campaigns/[id]/start/route.ts
// Starts a campaign: validates, enrolls contacts, sends Email #1 to each
// Sets follow_up_due_at ONLY after successful Email #1 send (per amended plan)

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/sendgrid/client'
import type { Contact } from '@/lib/supabase/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  try {
    const body = await req.json().catch(() => ({}))
    const { contact_ids } = body as { contact_ids?: string[] }

    const db = getServerSupabase()

    // 1. Load campaign
    const { data: campaign, error: campErr } = await db
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (campErr || !campaign) {
      return Response.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (!['draft', 'paused'].includes(campaign.status)) {
      return Response.json(
        { error: `Cannot start campaign in status: ${campaign.status}` },
        { status: 400 }
      )
    }

    if (!campaign.initial_template_id) {
      return Response.json({ error: 'Initial template ID is not configured' }, { status: 400 })
    }

    // 2. Get contacts to enroll
    let contactsQuery = db.from('contacts').select('*')
    if (contact_ids && contact_ids.length > 0) {
      contactsQuery = contactsQuery.in('id', contact_ids)
    }
    const { data: contacts, error: conErr } = await contactsQuery

    if (conErr || !contacts || contacts.length === 0) {
      return Response.json({ error: 'No contacts found to enroll' }, { status: 400 })
    }

    // 3. Set campaign to active
    await db
      .from('campaigns')
      .update({ status: 'active' })
      .eq('id', campaignId)

    // 4. For each contact: enroll + send Email #1
    const results = { sent: 0, failed: 0, skipped: 0 }
    const delayMs = campaign.follow_up_delay_minutes * 60 * 1000

    for (const contact of contacts as Contact[]) {
      // Check if already enrolled
      const { data: existing } = await db
        .from('campaign_contacts')
        .select('id, status')
        .eq('campaign_id', campaignId)
        .eq('contact_id', contact.id)
        .single()

      if (existing && existing.status !== 'queued') {
        results.skipped++
        continue
      }

      // Enroll contact (upsert)
      const { data: cc, error: ccErr } = await db
        .from('campaign_contacts')
        .upsert(
          {
            campaign_id: campaignId,
            contact_id: contact.id,
            status: 'sending',
            current_step: 1,
          },
          { onConflict: 'campaign_id,contact_id' }
        )
        .select()
        .single()

      if (ccErr || !cc) {
        console.error('[Start] Failed to enroll contact:', { contact_id: contact.id, error: ccErr?.message })
        results.failed++
        continue
      }

      // Create email_messages record (pending)
      const { data: msgRecord } = await db
        .from('email_messages')
        .insert({
          campaign_id: campaignId,
          contact_id: contact.id,
          campaign_contact_id: cc.id,
          step: 1,
          template_type: 'initial_outreach',
          status: 'pending',
        })
        .select()
        .single()

      // Send Email #1 via SendGrid
      const sendResult = await sendEmail({
        to: contact.email,
        fromEmail: campaign.from_email,
        fromName: campaign.from_name,
        templateId: campaign.initial_template_id,
        dynamicTemplateData: {
          firstName: contact.first_name,
          lastName: contact.last_name ?? '',
          email: contact.email,
          company: contact.company ?? '',
          designation: contact.designation ?? '',
        },
        customArgs: {
          campaign_id: campaignId,
          contact_id: contact.id,
          campaign_contact_id: cc.id,
          sequence_step: '1',
        },
      })

      if (sendResult.success) {
        const now = new Date()
        const followUpDue = new Date(now.getTime() + delayMs)

        // Update email_messages with success
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

        // Update campaign_contact — set follow_up_due_at ONLY after successful send
        await db
          .from('campaign_contacts')
          .update({
            status: 'sent',
            current_step: 1,
            email_1_sent_at: now.toISOString(),
            follow_up_due_at: followUpDue.toISOString(),
          })
          .eq('id', cc.id)

        // Log success
        await db.from('campaign_logs').insert({
          campaign_id: campaignId,
          contact_id: contact.id,
          level: 'info',
          message: 'Email #1 sent successfully',
          metadata: {
            template_type: 'initial_outreach',
            message_id: sendResult.messageId,
            follow_up_due_at: followUpDue.toISOString(),
          },
        })

        results.sent++
      } else {
        // Delivery failure: mark as failed, do NOT schedule follow-up
        if (msgRecord) {
          await db
            .from('email_messages')
            .update({ status: 'failed' })
            .eq('id', msgRecord.id)
        }

        await db
          .from('campaign_contacts')
          .update({
            status: 'failed',
            stopped: true,
          })
          .eq('id', cc.id)

        await db.from('campaign_logs').insert({
          campaign_id: campaignId,
          contact_id: contact.id,
          level: 'error',
          message: `Email #1 failed: ${sendResult.error}`,
          metadata: {
            error: sendResult.error,
            status_code: sendResult.statusCode,
          },
        })

        results.failed++
      }
    }

    console.log('[Campaign Start] Completed:', {
      campaign_id: campaignId,
      ...results,
    })

    return Response.json({
      success: true,
      campaign_id: campaignId,
      results,
      message: `Campaign started. Sent: ${results.sent}, Failed: ${results.failed}, Skipped: ${results.skipped}`,
    })
  } catch (err: unknown) {
    console.error('[Campaign Start] Error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to start campaign' },
      { status: 500 }
    )
  }
}
