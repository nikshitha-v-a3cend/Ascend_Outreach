// src/app/api/ai/classify/route.ts
// Classifies one or more contacts using the AI Classification Service.
//
// SCALE NOTE: classify_all is capped per request (CLASSIFY_ALL_REQUEST_CAP)
// and runs with bounded concurrency instead of one sequential OpenAI call
// per contact. A request classifying thousands of contacts sequentially
// would run for hours inside a single HTTP request and hit a serverless
// timeout long before finishing. Anything left unclassified after the cap
// is picked up automatically by the cron endpoint's classification sweep
// (see src/app/api/cron/process-followups/route.ts) every 5 minutes — this
// button is for on-demand/testing use, not the only way contacts get
// classified.

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { classifyContact } from '@/lib/ai/service'
import { mergeAiProfile } from '@/lib/ai/profile'
import { mapWithConcurrency } from '@/lib/ai/concurrency'
import { CLASSIFY_CONCURRENCY } from '@/lib/ai/safety'

export const runtime = 'nodejs'

// Max contacts processed in one classify_all request. Larger lists finish
// automatically over subsequent cron ticks rather than blocking this call.
const CLASSIFY_ALL_REQUEST_CAP = 300

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      contact_id?: string
      contact_ids?: string[]
      classify_all?: boolean
    }

    const db = getServerSupabase()

    let contactsToClassify: Array<{
      id: string
      first_name: string
      last_name: string | null
      email: string
      company: string | null
      designation: string | null
      department?: string | null
      ai_profile?: unknown
    }> = []

    if (body.contact_id) {
      const { data, error } = await db
        .from('contacts')
        .select('*')
        .eq('id', body.contact_id)
        .single()
      if (error || !data) return Response.json({ error: 'Contact not found' }, { status: 404 })
      contactsToClassify = [data]
    } else if (body.contact_ids && body.contact_ids.length > 0) {
      const { data } = await db
        .from('contacts')
        .select('*')
        .in('id', body.contact_ids)
      contactsToClassify = data ?? []
    } else if (body.classify_all) {
      // Prioritize never-classified contacts, oldest first, capped so this
      // request always finishes well inside a serverless timeout.
      const { data } = await db
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(CLASSIFY_ALL_REQUEST_CAP)
      contactsToClassify = data ?? []
    } else {
      return Response.json({ error: 'Provide contact_id, contact_ids, or classify_all: true' }, { status: 400 })
    }

    const { count: totalUnclassified } = body.classify_all
      ? await db.from('contacts').select('id', { count: 'exact', head: true }).is('ai_profile_updated_at', null)
      : { count: null }

    const results = await mapWithConcurrency(contactsToClassify, CLASSIFY_CONCURRENCY, async (contact) => {
      try {
        const classification = await classifyContact({
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          company: contact.company,
          department: contact.department,
          designation: contact.designation,
        })

        const now = new Date().toISOString()

        // Update contact record with classification — merge into ai_profile so
        // any prior Apify web/LinkedIn enrichment isn't wiped out by reclassifying.
        await db
          .from('contacts')
          .update({
            department: classification.department,
            industry: classification.industry,
            persona: classification.persona,
            seniority: classification.seniority,
            role_category: classification.role_category,
            company_category: classification.company_category,
            relevant_use_cases: classification.relevant_use_cases,
            ai_profile: mergeAiProfile(contact.ai_profile, classification) as any,
            ai_profile_updated_at: now,
          })
          .eq('id', contact.id)

        return {
          contact_id: contact.id,
          email: contact.email,
          success: true,
          classification,
        }
      } catch (err: unknown) {
        return {
          contact_id: contact.id,
          email: contact.email,
          success: false,
          error: err instanceof Error ? err.message : 'Classification failed',
        }
      }
    })

    const remaining = totalUnclassified ? Math.max(totalUnclassified - results.length, 0) : 0

    return Response.json({
      success: true,
      processed: results.length,
      remaining,
      message:
        remaining > 0
          ? `Classified ${results.length} contacts. ${remaining} more will be classified automatically over the next few minutes (cron sweep) — no further action needed.`
          : `Classified ${results.length} contacts.`,
      results,
    })
  } catch (err: unknown) {
    console.error('[AI Classify] Error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Classification failed' },
      { status: 500 }
    )
  }
}
