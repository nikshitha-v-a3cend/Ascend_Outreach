// scripts/test-schema.mjs
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
      process.env[key] = val
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

async function run() {
  const db = createClient(supabaseUrl, secretKey)

  // 1. Try to query ai_decisions
  const { error: decErr } = await db.from('ai_decisions').select('id').limit(1)
  console.log('ai_decisions test:', decErr ? `Need to create table: ${decErr.message}` : '✅ ai_decisions table exists!')

  // 2. Try to query contacts with new columns
  const { error: conErr } = await db.from('contacts').select('department, persona, relevant_use_cases, ai_profile').limit(1)
  console.log('contacts columns test:', conErr ? `Need to alter table: ${conErr.message}` : '✅ contacts AI columns exist!')

  // 3. Try to query email_messages with new columns
  const { error: emErr } = await db.from('email_messages').select('subject, body_text, decision_id').limit(1)
  console.log('email_messages columns test:', emErr ? `Need to alter table: ${emErr.message}` : '✅ email_messages AI columns exist!')

  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1); })
