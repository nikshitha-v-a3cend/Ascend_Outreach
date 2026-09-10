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
