// src/app/api/contacts/import/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerSupabase } from '@/lib/supabase/server'

const ContactRowSchema = z.object({
  first_name: z.string().min(1, 'Name is required'),
  last_name: z.string().optional().default(''),
  email: z.string().email('Invalid email address'),
  company: z.string().optional().default(''),
  designation: z.string().optional().default(''),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { contacts, campaign_id } = body as {
      contacts: Array<{
        first_name: string
        last_name?: string
        email: string
        company?: string
        designation?: string
      }>
      campaign_id?: string
    }

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return Response.json({ error: 'No contacts provided' }, { status: 400 })
    }

    const db = getServerSupabase()
    const results = {
      imported: 0,
      enrolled: 0,
      skipped: 0,
      errors: [] as Array<{ email: string; reason: string }>,
    }

    // Validate all rows
    const validContacts: Array<{
      first_name: string
      last_name: string
      email: string
      company: string
      designation: string
      source: string
    }> = []

    for (const row of contacts) {
      const parsed = ContactRowSchema.safeParse(row)
      if (!parsed.success) {
        results.errors.push({
          email: row.email || '(missing)',
          reason: parsed.error.issues[0]?.message || 'Validation failed',
        })
        continue
      }
      validContacts.push({
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        email: parsed.data.email.toLowerCase().trim(),
        company: parsed.data.company,
        designation: parsed.data.designation,
        source: 'csv_import',
      })
    }

    if (validContacts.length === 0) {
      return Response.json({ ...results, message: 'No valid contacts to import' }, { status: 200 })
    }

    // Upsert — ignore duplicates on email conflict for contacts table
    const { data: upserted, error } = await db
      .from('contacts')
      .upsert(validContacts, {
        onConflict: 'email',
        ignoreDuplicates: false,
      })
      .select('id')

    if (error) {
      console.error('[Import] Database error:', error.message)
      return Response.json({ error: `Database error: ${error.message}` }, { status: 500 })
    }

    results.imported = upserted?.length ?? 0

    // Fetch all IDs for these emails to handle both new and existing contacts
    const emails = validContacts.map((c) => c.email)
    const { data: allContactRows } = await db
      .from('contacts')
      .select('id, email')
      .in('email', emails)

    if (campaign_id && allContactRows && allContactRows.length > 0) {
      const campaignContactRows = allContactRows.map((c) => ({
        campaign_id,
        contact_id: c.id,
        status: 'queued',
        current_step: 0,
      }))

      const { data: enrolledData, error: enrollError } = await db
        .from('campaign_contacts')
        .upsert(campaignContactRows, {
          onConflict: 'campaign_id,contact_id',
          ignoreDuplicates: true,
        })
        .select('id')

      if (enrollError) {
        console.error('[Import] Failed to enroll in campaign:', enrollError.message)
      } else {
        results.enrolled = enrolledData?.length ?? 0
      }
    }

    console.log('[Import] Contacts imported:', {
      total_input: contacts.length,
      valid: validContacts.length,
      imported: results.imported,
      enrolled: results.enrolled,
      campaign_id: campaign_id ?? 'none',
      errors: results.errors.length,
    })

    const message = campaign_id
      ? `Successfully processed ${allContactRows?.length ?? 0} contacts and enrolled ${results.enrolled} into this campaign`
      : `Successfully imported ${results.imported} contacts`

    return Response.json({
      success: true,
      ...results,
      message,
    })
  } catch (err: unknown) {
    console.error('[Import] Unexpected error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 }
    )
  }
}

export async function GET(_req: NextRequest) {
  try {
    const db = getServerSupabase()
    const { data, error, count } = await db
      .from('contacts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ contacts: data, total: count })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch contacts' },
      { status: 500 }
    )
  }
}
