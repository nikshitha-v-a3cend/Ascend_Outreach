// src/app/api/health/route.ts
import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const result: Record<string, string> = {}

  // Check database
  try {
    const db = getServerSupabase()
    const { error } = await db.from('campaigns').select('id').limit(1)
    result.database = error ? `error: ${error.message}` : 'ok'
  } catch (err: unknown) {
    result.database = `error: ${err instanceof Error ? err.message : 'unknown'}`
  }

  // Check SendGrid configuration (do not expose the key itself)
  const sgKey = process.env.SENDGRID_API_KEY
  result.sendgrid = sgKey && sgKey.startsWith('SG.') ? 'configured' : 'not_configured'
  result.from_email = process.env.SENDGRID_FROM_EMAIL ? 'configured' : 'not_configured'

  const allOk = result.database === 'ok' && result.sendgrid === 'configured'

  return Response.json(result, { status: allOk ? 200 : 503 })
}
