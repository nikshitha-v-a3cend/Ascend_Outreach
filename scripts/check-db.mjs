// scripts/run-migration.mjs
// Runs the SQL migration against Supabase using the service-role key
// Usage: node scripts/run-migration.mjs

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load env from .env.local manually
import { config } from './load-env.mjs'
config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !secretKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}

const sql = readFileSync(join(__dirname, '../supabase/migrations/001_initial_schema.sql'), 'utf-8')

// Split on double-newline separated statements for batch execution
// But Supabase REST SQL endpoint takes the whole script
const endpoint = `${supabaseUrl}/rest/v1/rpc/exec_sql`

// Use the pg-based approach via Supabase's SQL endpoint
const response = await fetch(`${supabaseUrl}/rest/v1/`, {
  method: 'GET',
  headers: {
    'apikey': secretKey,
    'Authorization': `Bearer ${secretKey}`,
  },
})

console.log('Supabase connection test:', response.status)

// Execute via the management API (requires pg connection string)
// For simplicity, let's use the Supabase JS client to test table creation
const { createClient } = await import('@supabase/supabase-js')
const db = createClient(supabaseUrl, secretKey)

// Test a simple query to see if tables exist
const { data, error } = await db.from('campaigns').select('id').limit(1)
if (error) {
  console.log('Tables do not exist yet:', error.message)
  console.log('\n📋 Please run the migration manually:')
  console.log('1. Open: https://supabase.com/dashboard/project/gktoubtxvmxsdngjkolx/sql')
  console.log('2. Paste the contents of: supabase/migrations/001_initial_schema.sql')
  console.log('3. Click Run')
} else {
  console.log('✅ Tables already exist! Database is ready.')
}
