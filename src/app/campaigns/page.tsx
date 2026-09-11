'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Megaphone } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDistanceToNow } from 'date-fns'

interface CampaignWithStats {
  id: string
  name: string
  status: string
  test_mode: boolean
  from_email: string
  follow_up_delay_minutes: number
  created_at: string
  stats: {
    total: number
    sent: number
    opened: number
    replied: number
    bounced: number
  }
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/campaigns')
      .then((r) => r.json())
      .then((data: { campaigns: CampaignWithStats[] }) => setCampaigns(data.campaigns ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-subtitle">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/campaigns/new" id="new-campaign-link" className="btn btn-primary">
          <Plus size={15} /> New Campaign
        </Link>
      </div>

      {loading ? (
        <div style={{ padding: 64, textAlign: 'center' }}><span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /></div>
      ) : campaigns.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 40, marginBottom: 12 }}>📢</div>
          <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>No campaigns yet</div>
          <div style={{ fontSize: 14, marginBottom: 24, color: 'var(--text-muted)' }}>
            Create your first campaign to start sending outreach emails
          </div>
          <Link href="/campaigns/new" className="btn btn-primary"><Plus size={15} /> Create Campaign</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="card card-hover"
              style={{ textDecoration: 'none', display: 'block' }}
              id={`campaign-card-${c.id}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                {/* Icon */}
                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--brand-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Megaphone size={20} color="var(--brand-primary)" />
                </div>

                {/* Name & meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{c.name}</span>
                    <StatusBadge status={c.status} />
                    {c.test_mode && <StatusBadge status="test_mode" />}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {c.from_email} · Created {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
                  {[
                    { label: 'Contacts', value: c.stats.total },
                    { label: 'Sent', value: c.stats.sent },
                    { label: 'Opened', value: c.stats.opened },
                    { label: 'Replied', value: c.stats.replied },
                    { label: 'Bounced', value: c.stats.bounced },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ textAlign: 'center', minWidth: 48 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
