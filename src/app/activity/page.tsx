'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

interface ActivityItem {
  id: string
  level: string
  message: string
  created_at: string
  campaign_id: string
  contact?: { id: string; first_name: string; last_name: string | null; company: string | null } | null
  metadata?: Record<string, unknown>
}

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get all campaign logs globally
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((data: { recent_activity: ActivityItem[] }) => setItems(data.recent_activity ?? []))
      .finally(() => setLoading(false))
  }, [])

  const levelIcon: Record<string, string> = {
    info: '✓',
    warn: '⚠',
    error: '✗',
  }

  const levelColor: Record<string, string> = {
    info: 'var(--color-success)',
    warn: 'var(--color-warning)',
    error: 'var(--color-error)',
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-subtitle">Recent campaign events and email activity</p>
        </div>
        <button
          id="refresh-activity-btn"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setLoading(true)
            fetch('/api/dashboard')
              .then((r) => r.json())
              .then((data: { recent_activity: ActivityItem[] }) => setItems(data.recent_activity ?? []))
              .finally(() => setLoading(false))
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 64, textAlign: 'center' }}>
          <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No activity yet</div>
          <div style={{ fontSize: 13 }}>Start a campaign to see events appear here</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bg-border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{items.length} Recent Events</span>
          </div>
          <div className="timeline" style={{ padding: '16px 20px 16px 44px' }}>
            {items.map((item) => (
              <div key={item.id} className="timeline-item" style={{ '--dot-color': levelColor[item.level] ?? 'var(--brand-primary)' } as React.CSSProperties}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: `${levelColor[item.level]}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, color: levelColor[item.level],
                    flexShrink: 0, marginTop: 2,
                  }}>
                    {levelIcon[item.level] ?? '·'}
                  </div>
                  <div style={{ flex: 1 }}>
                    {item.contact && (
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                        {item.contact.first_name} {item.contact.last_name}
                        {item.contact.company && (
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}> · {item.contact.company}</span>
                        )}
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.message}</div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
                      <span>
                        {(() => {
                          const ts = (item.metadata?.timestamp as string) || item.created_at
                          return formatDistanceToNow(new Date(ts), { addSuffix: true })
                        })()}
                      </span>
                      <Link
                        href={`/campaigns/${item.campaign_id}`}
                        style={{ color: 'var(--brand-primary)', textDecoration: 'none' }}
                      >
                        View Campaign →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
