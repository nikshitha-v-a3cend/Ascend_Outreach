// src/app/api/dev/seed/route.ts
// DEV ONLY — Seeds the test contacts from the provided test data
// Remove this endpoint before production deployment
// Only works after the database migration has been run

import { getServerSupabase } from '@/lib/supabase/server'

const TEST_CONTACTS = [
  {
    first_name: 'Nirmalya',
    last_name: 'Sengupta',
    email: 'nirmalya.sengupta@a3cend.com',
    company: 'A3CEND',
    designation: 'CEO',
    source: 'test_seed',
  },
  {
    first_name: 'Sukendu',
    last_name: 'Maji',
    email: 'sukendu.maji@a3cend.com',
    company: 'A3CEND',
    designation: 'Sales',
    source: 'test_seed',
  },
  {
    first_name: 'Riya',
    last_name: 'Singh',
    email: 'riya.singh@a3cend.com',
    company: 'A3CEND',
    designation: 'Operations',
    source: 'test_seed',
  },
  {
    first_name: 'Nikshitha',
    last_name: 'Vaidyanathan',
    email: 'nikshitha.v@a3cend.com',
    company: 'A3CEND',
    designation: 'Technology',
    source: 'test_seed',
  },
]

export async function POST() {
  try {
    const db = getServerSupabase()

    const { data, error } = await db
      .from('contacts')
      .upsert(TEST_CONTACTS, { onConflict: 'email', ignoreDuplicates: false })
      .select('id, first_name, last_name, email, company, designation')

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    console.log('[Seed] Test contacts inserted:', data?.length)

    return Response.json({
      success: true,
      message: `Seeded ${data?.length ?? 0} test contacts`,
      contacts: data,
    })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Seed failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return POST()
}
