// scratch/check_times.mjs
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const envContent = readFileSync('.env.local', 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      env[key] = val
    }
  }
}

const db = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SECRET_KEY'])

async function run() {
  const { data: cc } = await db.from('campaign_contacts').select('id, opened, email_1_opened_at, email_1_sent_at, updated_at').eq('id', '2be7daac-669d-406a-b356-7a5acff4b5f0').single()
  console.log('Sukendu row in DB:', cc)
}

run().catch(console.error)
