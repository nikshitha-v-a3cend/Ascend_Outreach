'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users, Megaphone, Mail, Eye, MessageSquare, RefreshCcw, AlertTriangle, TrendingUp
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Stats {
  total_contacts: number
  active_campaigns: number
  emails_sent: number
  opened: number
  replies: number
  follow_ups_sent: number
  bounced: number
  unsubscribed: number
}

interface ActivityItem {
  id: string
  level: string
  message: string
  created_at: string
  contact?: { id: string; first_name: string; last_name: string; company: string } | null
  metadata?: Record<string, unknown>
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((data: { stats: Stats; recent_activity: ActivityItem[] }) => {
        setStats(data.stats)
        setActivity(data.recent_activity ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

  const statCards = stats
    ? [
        { label: 'Total Contacts', value: stats.total_contacts, icon: Users, color: 'var(--brand-teal)' },
        { label: 'Active Campaigns', value: stats.active_campaigns, icon: Megaphone, color: 'var(--brand-cyan)' },
        { label: 'Emails Sent', value: stats.emails_sent, icon: Mail, color: 'var(--brand-teal)' },
        { label: 'Opened', value: stats.opened, icon: Eye, color: 'var(--color-success)' },
        { label: 'Replies', value: stats.replies, icon: MessageSquare, color: 'var(--brand-coral)' },
        { label: 'Follow-ups Sent', value: stats.follow_ups_sent, icon: RefreshCcw, color: 'var(--brand-cyan)' },
        { label: 'Bounced', value: stats.bounced, icon: AlertTriangle, color: 'var(--color-error)' },
        { label: 'Unsubscribed', value: stats.unsubscribed, icon: TrendingUp, color: 'var(--color-warning)' },
      ]
    : []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your outreach campaigns</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/campaigns/new" id="new-campaign-btn" className="btn btn-primary">
            <Megaphone size={15} /> New Campaign
          </Link>
          <Link href="/contacts" id="import-contacts-link" className="btn btn-secondary">
            <Users size={15} /> Import Contacts
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64, color: 'var(--text-muted)' }}>
          <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="stats-grid" style={{ marginBottom: 32 }}>
            {statCards.map(({ label, value, icon: Icon, color }) => (
              <div
                key={label}
                className="stat-card"
                style={{ '--accent-color': color } as React.CSSProperties}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em' }}>
                    {value.toLocaleString()}
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} color={color} />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Quick actions + recent activity */}
          <div className="grid-2" style={{ alignItems: 'start' }}>
            {/* Recent Activity */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>Recent Activity</span>
                <a href="/activity" style={{ fontSize: 12, color: 'var(--brand-primary)', textDecoration: 'none' }}>View all →</a>
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {activity.length === 0 ? (
                  <div className="empty-state" style={{ padding: 40 }}>
                    <div style={{ marginBottom: 8 }}>📭</div>
                    <div>No activity yet. Start a campaign to see events here.</div>
                  </div>
                ) : (
                  activity.map((item) => (
                    <div key={item.id} style={{
                      padding: '12px 20px',
                      borderBottom: '1px solid var(--bg-border-subtle)',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}>
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: item.level === 'error' ? '#ef444420' : item.level === 'warn' ? '#f59e0b20' : 'var(--brand-glow)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontSize: 14,
                      }}>
                        {item.level === 'error' ? '✗' : item.level === 'warn' ? '⚠' : '✓'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {item.contact && (
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                            {item.contact.first_name} {item.contact.last_name}
                            {item.contact.company && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {item.contact.company}</span>}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>{item.message}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {(() => {
                            const ts = (item.metadata?.timestamp as string) || item.created_at
                            return formatDistanceToNow(new Date(ts), { addSuffix: true })
                          })()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick links */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card">
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Quick Actions</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Link href="/campaigns/new" className="btn btn-secondary" id="qa-new-campaign" style={{ justifyContent: 'flex-start' }}>
                    <Megaphone size={15} /> Create Campaign
                  </Link>
                  <Link href="/contacts" className="btn btn-secondary" id="qa-import" style={{ justifyContent: 'flex-start' }}>
                    <Users size={15} /> Import Contacts
                  </Link>
                  <Link href="/templates" className="btn btn-secondary" id="qa-templates" style={{ justifyContent: 'flex-start' }}>
                    <Mail size={15} /> Configure Templates
                  </Link>
                  <Link href="/settings" className="btn btn-secondary" id="qa-settings" style={{ justifyContent: 'flex-start' }}>
                    Configure Settings
                  </Link>
                </div>
              </div>

              <div className="card" style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
                <div style={{ fontSize: 12, color: 'var(--brand-primary)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Getting Started
                </div>
                <ol style={{ paddingLeft: 16, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 2, margin: 0 }}>
                  <li>Import contacts via CSV</li>
                  <li>Configure SendGrid template IDs</li>
                  <li>Create a campaign</li>
                  <li>Send a test email first</li>
                  <li>Start Test Campaign</li>
                </ol>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
