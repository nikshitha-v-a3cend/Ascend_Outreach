// src/lib/apify/enrichment.ts
// Service module to orchestrate Apify web search enrichment for Supabase contacts

import { getServerSupabase } from '@/lib/supabase/server'
import { withSupabaseRetry, getErrorMessage } from '@/lib/supabase/retry'
import { performFullApifyEnrichment, CombinedApifyEnrichment } from './client'
import { safeAiProfile, mergeAiProfile } from '@/lib/ai/profile'
import type { Contact } from '@/lib/supabase/types'

/**
 * Enriches a single contact using Apify Web Search (Company About & LinkedIn Person About)
 */
export async function enrichContactWithApify(contactId: string): Promise<{
  success: boolean
  contact?: Contact
  apifyData?: CombinedApifyEnrichment
  error?: string
}> {
  const supabase = getServerSupabase()

  // 1. Fetch contact (retried — a transient network blip here shouldn't
  // fail enrichment outright)
  const { data: contact, error: fetchError } = await withSupabaseRetry(() =>
    supabase.from('contacts').select('*').eq('id', contactId).single()
  )

  if (fetchError || !contact) {
    return { success: false, error: fetchError ? getErrorMessage(fetchError) : 'Contact not found' }
  }

  try {
    // 2. Perform Apify Web Search (Company + LinkedIn Person) — anchored on
    // a known LinkedIn URL / company domain when the contact has one, so
    // enrichment searches a verified source instead of guessing a match.
    const apifyData = await performFullApifyEnrichment({
      first_name: contact.first_name,
      last_name: contact.last_name,
      company: contact.company,
      designation: contact.designation,
      domain: contact.company_domain,
      linkedin_url: contact.linkedin_url,
    })

    // 3. Merge into AI Profile
    const existingAiProfile = safeAiProfile(contact.ai_profile)
    const updatedAiProfile = mergeAiProfile(existingAiProfile, {
      apify_enrichment: apifyData,
      summary: apifyData.person_linkedin_about
        ? `[Apify Enriched] ${apifyData.person_linkedin_about.slice(0, 180)}...`
        : existingAiProfile.summary,
    })

    // 4. Update Database (store inside ai_profile JSON column) — retried
    // for the same reason as the fetch above.
    const { data: updatedContact, error: updateError } = await withSupabaseRetry(() =>
      supabase
        .from('contacts')
        .update({
          ai_profile: updatedAiProfile as any,
          ai_profile_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId)
        .select()
        .single()
    )

    if (updateError) {
      const message = getErrorMessage(updateError)
      console.error(`[Apify DB Update Error] ${message}`)
      return { success: false, error: message }
    }

    // Use the in-memory clean object we just wrote rather than re-parsing
    // whatever the re-select returned — ai_profile round-trips as a
    // JSON-encoded string on some column configurations, and there is no
    // reason to pay a parse just to reconstruct what we already have.
    return {
      success: true,
      contact: { ...(updatedContact as unknown as Contact), ai_profile: updatedAiProfile as any },
      apifyData,
    }
  } catch (error: unknown) {
    console.error(`[Apify Enrichment Error] Contact ID ${contactId}:`, error)
    return { success: false, error: getErrorMessage(error) || 'Apify enrichment failed' }
  }
}

/**
 * Batch enrich multiple contacts with Apify Web Search
 */
export async function batchEnrichContactsWithApify(contactIds: string[]): Promise<{
  total: number
  succeeded: number
  failed: number
  results: Array<{ id: string; success: boolean; error?: string }>
}> {
  const results: Array<{ id: string; success: boolean; error?: string }> = []
  let succeeded = 0
  let failed = 0

  for (const id of contactIds) {
    const res = await enrichContactWithApify(id)
    if (res.success) {
      succeeded++
      results.push({ id, success: true })
    } else {
      failed++
      results.push({ id, success: false, error: res.error })
    }
  }

  return {
    total: contactIds.length,
    succeeded,
    failed,
    results,
  }
}
