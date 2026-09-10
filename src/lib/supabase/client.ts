// src/lib/supabase/client.ts
// Browser-side Supabase client — uses NEXT_PUBLIC anon/publishable key only
// Safe to use in React components

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
if (!supabasePublishableKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
