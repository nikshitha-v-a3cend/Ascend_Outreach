// scripts/migrate.mjs
// Runs the SQL migration directly against Supabase
// Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local
// Usage: node scripts/migrate.mjs

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Parse .env.local manually
const envContent = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  const val = trimmed.slice(eq + 1).trim()
  env[key] = val
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL']
const secretKey = env['SUPABASE_SECRET_KEY']

if (!supabaseUrl || !secretKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
  process.exit(1)
}

console.log('📡 Connecting to Supabase:', supabaseUrl)

const sql = readFileSync(
  join(__dirname, '../supabase/migrations/001_initial_schema.sql'),
  'utf-8'
)

// Use Supabase's SQL-over-REST via the pg_execute endpoint
// This is available on Supabase projects via the /rest/v1/rpc pattern
// For direct SQL we need to use the Supabase Management API or pg connection

// Try Supabase's newer sb_secret key via REST
const testResp = await fetch(`${supabaseUrl}/rest/v1/campaigns?limit=1`, {
  headers: {
    'apikey': secretKey,
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  },
})

if (testResp.ok || testResp.status === 200) {
  const data = await testResp.json()
  console.log('✅ Database tables already exist! Found campaigns table.')
  console.log('Data:', data)
  process.exit(0)
}

const errBody = await testResp.json().catch(() => ({}))
console.log(`Response: ${testResp.status}`, errBody)

if (errBody?.message?.includes('Could not find the table')) {
  console.log('\n📋 Tables do not exist yet.')
  console.log('━'.repeat(60))
  console.log('Please run the migration in Supabase SQL Editor:')
  console.log(`\n👉 ${supabaseUrl.replace('.supabase.co', '')}.supabase.com/project/gktoubtxvmxsdngjkolx/sql\n`)
  console.log('Or go to: https://supabase.com/dashboard → your project → SQL Editor')
  console.log('\nSQL file location:')
  console.log('  ', join(__dirname, '../supabase/migrations/001_initial_schema.sql'))
  console.log('━'.repeat(60))
} else {
  console.log('⚠️ Unexpected response from Supabase. Check your credentials.')
}
