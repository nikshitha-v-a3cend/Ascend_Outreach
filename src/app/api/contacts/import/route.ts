// src/app/api/contacts/import/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerSupabase } from '@/lib/supabase/server'
import { safeAiProfile, mergeAiProfile } from '@/lib/ai/profile'

const ContactRowSchema = z.object({
  first_name: z.string().min(1, 'Name is required'),
  last_name: z.string().optional().default(''),
  email: z.string().email('Invalid email address'),
  company: z.string().optional().default(''),
  designation: z.string().optional().default(''),
  linkedin_url: z.string().optional().default(''),
  company_domain: z.string().optional().default(''),
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
        linkedin_url?: string
        company_domain?: string
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
      linkedin_url: string
      company_domain: string
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
        linkedin_url: parsed.data.linkedin_url,
        company_domain: parsed.data.company_domain,
        source: 'csv_import',
      })
    }

    if (validContacts.length === 0) {
      return Response.json({ ...results, message: 'No valid contacts to import' }, { status: 200 })
    }

    // Upsert — ignore duplicates on email conflict for contacts table
    let { data: upserted, error } = await db
      .from('contacts')
      .upsert(validContacts, {
        onConflict: 'email',
        ignoreDuplicates: false,
      })
      .select('id')

    // Graceful fallback if migration 003 (linkedin_url/company_domain) hasn't
    // been run in Supabase yet — retry without those two columns rather than
    // failing the whole import.
    if (error && (error.message.includes('column') || error.message.includes('schema cache'))) {
      console.warn('[Import] Retrying without linkedin_url/company_domain (migration 003 not yet applied):', error.message)
      const basicContacts = validContacts.map(({ linkedin_url, company_domain, ...rest }) => rest)
      const retry = await db
        .from('contacts')
        .upsert(basicContacts, { onConflict: 'email', ignoreDuplicates: false })
        .select('id')
      upserted = retry.data
      error = retry.error
    }

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

    // NOTE: newly imported contacts are intentionally NOT classified here.
    // A fire-and-forget Promise.all with no concurrency limit used to run
    // at this point, but on a serverless deployment background work after
    // the response is sent has no guarantee of completing, and for a large
    // CSV it would also blow past the AI provider's rate limits all at
    // once. Instead, every contact with no ai_profile_updated_at is picked
    // up automatically (bounded batch + bounded concurrency) by the cron
    // endpoint's classification sweep every 5 minutes — see
    // src/app/api/cron/process-followups/route.ts. Importing 5,000
    // contacts needs zero manual follow-up; they classify themselves over
    // the next several cron ticks.

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

export async function GET() {
  try {
    const db = getServerSupabase()
    const { data, error, count } = await db
      .from('contacts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    // ai_profile can round-trip as a JSON-encoded string rather than a
    // parsed object — normalize before returning so the UI can actually
    // see cached persona/apify data instead of treating it as absent.
    const contacts = (data ?? []).map((c) => ({ ...c, ai_profile: safeAiProfile(c.ai_profile) }))

    return Response.json({ contacts, total: count })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch contacts' },
      { status: 500 }
    )
  }
}
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, first_name, last_name, email, company, designation, linkedin_url, company_domain, department, industry, persona, seniority } = body

    if (!id) {
      return Response.json({ error: 'Contact ID is required' }, { status: 400 })
    }

    const db = getServerSupabase()

    // Fetch existing contact
    const { data: existing } = await db.from('contacts').select('*').eq('id', id).single()
    if (!existing) {
      return Response.json({ error: 'Contact not found' }, { status: 404 })
    }

    const updatedAiProfile = mergeAiProfile(existing.ai_profile, {
      ...(persona ? { persona } : {}),
      ...(seniority ? { seniority } : {}),
      ...(department ? { department } : {}),
      ...(industry ? { industry } : {}),
    })

    const updatePayload = {
        ...(first_name !== undefined ? { first_name } : {}),
        ...(last_name !== undefined ? { last_name } : {}),
        ...(email !== undefined ? { email: email.toLowerCase().trim() } : {}),
        ...(company !== undefined ? { company } : {}),
        ...(designation !== undefined ? { designation } : {}),
        ...(linkedin_url !== undefined ? { linkedin_url } : {}),
        ...(company_domain !== undefined ? { company_domain } : {}),
        ...(department !== undefined ? { department } : {}),
        ...(industry !== undefined ? { industry } : {}),
        ...(persona !== undefined ? { persona } : {}),
        ...(seniority !== undefined ? { seniority } : {}),
        ai_profile: updatedAiProfile as any,
        updated_at: new Date().toISOString(),
    }

    let { data: updated, error } = await db
      .from('contacts')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    // Graceful fallback if migration 003 (linkedin_url/company_domain) hasn't
    // been run in Supabase yet — retry without those two columns.
    if (error && (error.message.includes('column') || error.message.includes('schema cache'))) {
      console.warn('[Contacts PATCH] Retrying without linkedin_url/company_domain (migration 003 not yet applied):', error.message)
      const { linkedin_url: _lu, company_domain: _cd, ...basicPayload } = updatePayload
      const retry = await db.from('contacts').update(basicPayload).eq('id', id).select().single()
      updated = retry.data
      error = retry.error
    }

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true, contact: updated })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to update contact' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as { contact_id?: string; delete_all?: boolean }
    const db = getServerSupabase()

    if (body.delete_all) {
      await db.from('campaign_contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      const { error } = await db.from('contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true, message: 'All contacts deleted' })
    }

    const { contact_id } = body
    if (!contact_id) return Response.json({ error: 'contact_id is required' }, { status: 400 })

    // Remove from all campaigns first (foreign key)
    await db.from('campaign_contacts').delete().eq('contact_id', contact_id)

    // Delete the contact
    const { error } = await db.from('contacts').delete().eq('id', contact_id)
    if (error) return Response.json({ error: error.message }, { status: 500 })

    return Response.json({ success: true })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to delete contact' },
      { status: 500 }
    )
  }
}


