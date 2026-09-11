// src/app/api/dashboard/route.ts
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET() {
  const db = getServerSupabase()

  const [
    { count: totalContacts },
    { count: activeCampaigns },
    { data: ccData },
    { data: recentLogs },
  ] = await Promise.all([
    db.from('contacts').select('*', { count: 'exact', head: true }),
    db.from('campaigns').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('campaign_contacts').select('status, opened, replied, bounced, unsubscribed, follow_up_sent_at'),
    db
      .from('campaign_logs')
      .select('*, contact:contacts(id, first_name, last_name, company)')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const stats = {
    total_contacts: totalContacts ?? 0,
    active_campaigns: activeCampaigns ?? 0,
    emails_sent: 0,
    opened: 0,
    replies: 0,
    follow_ups_sent: 0,
    bounced: 0,
    unsubscribed: 0,
  }

  for (const cc of ccData ?? []) {
    if (['sent', 'opened', 'no_open', 'follow_up_sent', 'replied'].includes(cc.status)) stats.emails_sent++
    if (cc.opened) stats.opened++
    if (cc.replied) stats.replies++
    if (cc.follow_up_sent_at) stats.follow_ups_sent++
    if (cc.bounced) stats.bounced++
    if (cc.unsubscribed) stats.unsubscribed++
  }

  return Response.json({ stats, recent_activity: recentLogs ?? [] })
}
