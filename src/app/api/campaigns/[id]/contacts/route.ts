// src/app/api/campaigns/[id]/contacts/route.ts
import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const db = getServerSupabase()

  const { searchParams } = req.nextUrl
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const offset = (page - 1) * limit

  const { data, error, count } = await db
    .from('campaign_contacts')
    .select(`
      *,
      contact:contacts(id, first_name, last_name, email, company, designation)
    `, { count: 'exact' })
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ contacts: data, total: count, page, limit })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const { contact_ids } = await req.json() as { contact_ids: string[] }

  if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
    return Response.json({ error: 'contact_ids array is required' }, { status: 400 })
  }

  const db = getServerSupabase()

  const rows = contact_ids.map((cid) => ({
    campaign_id: campaignId,
    contact_id: cid,
    status: 'queued',
    current_step: 0,
  }))

  const { data, error } = await db
    .from('campaign_contacts')
    .upsert(rows, { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true })
    .select()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ added: data?.length ?? 0, total: contact_ids.length })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const { contact_id } = (await req.json()) as { contact_id: string }

  if (!contact_id) {
    return Response.json({ error: 'contact_id is required' }, { status: 400 })
  }

  const db = getServerSupabase()
  const { error } = await db
    .from('campaign_contacts')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('contact_id', contact_id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const { campaign_contact_id, replied, opened, reset, reset_all, manual_reply } = (await req.json()) as {
    campaign_contact_id?: string
    replied?: boolean
    opened?: boolean
    reset?: boolean // full reset back to queued
    reset_all?: boolean // reset all contacts in campaign to queued
    manual_reply?: boolean // team member replied manually to prospect
  }

  const db = getServerSupabase()

  if (reset_all) {
    const { error: resetErr } = await db.from('campaign_contacts').update({
      status: 'queued',
      opened: false,
      replied: false,
      stopped: false,
      bounced: false,
      unsubscribed: false,
      email_1_sent_at: null,
      email_1_opened_at: null,
      email_1_replied_at: null,
      follow_up_sent_at: null,
      follow_up_due_at: null,
      current_step: 0,
    }).eq('campaign_id', campaignId)

    if (resetErr) return Response.json({ error: resetErr.message }, { status: 500 })
    return Response.json({ success: true, message: 'All contacts reset to Step 0' })
  }

  if (!campaign_contact_id) {
    return Response.json({ error: 'campaign_contact_id is required' }, { status: 400 })
  }

  const updatePayload: Record<string, unknown> = {}

  // Full reset — clears all state back to fresh queued
  if (reset) {
    updatePayload.status = 'queued'
    updatePayload.opened = false
    updatePayload.replied = false
    updatePayload.stopped = false
    updatePayload.bounced = false
    updatePayload.unsubscribed = false
    updatePayload.email_1_sent_at = null
    updatePayload.email_1_opened_at = null
    updatePayload.email_1_replied_at = null
    updatePayload.follow_up_sent_at = null
    updatePayload.follow_up_due_at = null
    updatePayload.current_step = 0
  } else if (manual_reply) {
    // Manual reply from our team: schedule re-engagement follow-up if prospect goes silent
    const { data: camp } = await db.from('campaigns').select('follow_up_delay_minutes').eq('id', campaignId).single()
    const delayMinutes = camp?.follow_up_delay_minutes || 5
    const nextDue = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()

    updatePayload.status = 'manual_reply_sent'
    updatePayload.stopped = false
    updatePayload.replied = false
    updatePayload.follow_up_due_at = nextDue

    const { data: ccRow } = await db.from('campaign_contacts').select('contact_id').eq('id', campaign_contact_id).single()
    if (ccRow?.contact_id) {
      await db.from('campaign_logs').insert({
        campaign_id: campaignId,
        contact_id: ccRow.contact_id,
        level: 'info',
        message: 'Team manual reply logged. Re-engagement follow-up scheduled if prospect does not respond.',
        metadata: { next_due: nextDue },
      })
    }
  } else {
    if (replied !== undefined) {
      updatePayload.replied = replied
      if (replied) {
        updatePayload.email_1_replied_at = new Date().toISOString()
        updatePayload.status = 'replied'
        updatePayload.stopped = true
      }
    }

    if (opened !== undefined) {
      updatePayload.opened = opened
      if (opened) {
        updatePayload.email_1_opened_at = new Date().toISOString()
      } else {
        updatePayload.email_1_opened_at = null
        updatePayload.status = 'sent'
      }
    }
  }

  const { error } = await db
    .from('campaign_contacts')
    .update(updatePayload as any)
    .eq('id', campaign_contact_id)
    .eq('campaign_id', campaignId)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true })
}
