// src/lib/supabase/server.ts
// Server-side Supabase client — uses SUPABASE_SECRET_KEY (service role)
// NEVER import this file in client-side code (components, hooks, etc.)
// Only use in: API route handlers, server components, cron handlers

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
if (!supabaseSecretKey) throw new Error('Missing SUPABASE_SECRET_KEY')

// Singleton pattern: reuse the same client instance per server process
let serverClient: SupabaseClient<Database> | null = null

export function getServerSupabase(): SupabaseClient<Database> {
  if (!serverClient) {
    serverClient = createClient<Database>(supabaseUrl, supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }
  return serverClient
}
