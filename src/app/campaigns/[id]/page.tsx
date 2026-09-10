'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Play, Pause, Square, Send, RefreshCw, Upload, UserPlus, Trash2, Users } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StartCampaignModal } from '@/components/campaigns/StartCampaignModal'
import { EnrollContactsModal } from '@/components/campaigns/EnrollContactsModal'
import { CampaignImportModal } from '@/components/campaigns/CampaignImportModal'
import { formatDistanceToNow } from 'date-fns'
import type { Campaign } from '@/lib/supabase/types'

interface CampaignStats {
  total: number
  queued: number
  sent: number
  opened: number
  replied: number
  bounced: number
  unsubscribed: number
  follow_up_sent: number
  failed: number
}

interface CampaignContact {
  id: string
  status: string
  current_step: number
  opened: boolean
  replied: boolean
  bounced: boolean
  unsubscribed: boolean
  email_1_sent_at: string | null
  follow_up_sent_at: string | null
  follow_up_due_at: string | null
  updated_at: string
  contact: {
    id: string
    first_name: string
    last_name: string | null
    email: string
    company: string | null
    designation: string | null
  }
}

export default function CampaignDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [contacts, setContacts] = useState<CampaignContact[]>([])
  const [loading, setLoading] = useState(true)
  const [showStartModal, setShowStartModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showEnrollModal, setShowEnrollModal] = useState(false)
  const [removingContactId, setRemovingContactId] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [actionLoading, setActionLoading] = useState('')

  const load = () => {
    Promise.all([
      fetch(`/api/campaigns/${id}`).then((r) => r.json()),
      fetch(`/api/campaigns/${id}/contacts?limit=200`).then((r) => r.json()),
    ]).then(([campData, contactsData]: [
      { campaign: Campaign; stats: CampaignStats },
      { contacts: CampaignContact[] }
    ]) => {
      setCampaign(campData.campaign)
      setStats(campData.stats)
      setContacts(contactsData.contacts ?? [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const [runningFollowups, setRunningFollowups] = useState(false)
  const [cronFeedback, setCronFeedback] = useState<string | null>(null)

  const handleProcessFollowups = async () => {
    setRunningFollowups(true)
    setCronFeedback(null)
    try {
      const res = await fetch('/api/cron/process-followups', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer a3cend_cron_secret_local_dev_only`,
        },
      })
      const data = await res.json() as { processed?: number; sent?: number; skipped?: number; message?: string }
      setCronFeedback(
        data.sent !== undefined
          ? `Processed ${data.processed ?? 0} contact(s): Sent ${data.sent} follow-up email(s), skipped ${data.skipped ?? 0}.`
          : data.message || 'Follow-ups processed.'
      )
      load()
    } catch {
      setCronFeedback('Failed to process follow-ups.')
    } finally {
      setRunningFollowups(false)
    }
  }

  const handleAction = async (action: 'pause' | 'resume' | 'stop') => {
    setActionLoading(action)
    await fetch(`/api/campaigns/${id}/${action}`, { method: 'POST' })
    setActionLoading('')
    load()
  }

  const handleStart = async () => {
    await fetch(`/api/campaigns/${id}/start`, { method: 'POST' })
    load()
  }

  const handleRemoveContact = async (contactId: string) => {
    if (!confirm('Remove this contact from this campaign?')) return
    setRemovingContactId(contactId)
    try {
      await fetch(`/api/campaigns/${id}/contacts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      })
      load()
    } finally {
      setRemovingContactId(null)
    }
  }

  const sendTestEmail = async () => {
    if (!testEmail) return
    setTestSending(true)
    setTestResult(null)
    const res = await fetch(`/api/campaigns/${id}/send-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test_email: testEmail, template_type: 'initial_outreach' }),
    })
    const data = await res.json() as { success: boolean; message?: string; error?: string }
    setTestResult({ success: data.success, message: data.message ?? data.error ?? '' })
    setTestSending(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    )
  }

  if (!campaign) return <div className="alert alert-error">Campaign not found</div>

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/campaigns" className="btn btn-secondary btn-sm" id="back-btn"><ArrowLeft size={14} /></a>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h1 className="page-title" style={{ margin: 0 }}>{campaign.name}</h1>
              <StatusBadge status={campaign.status} />
              {campaign.test_mode && <StatusBadge status="test_mode" />}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['draft', 'paused'].includes(campaign.status) && (
            <button
              id="start-campaign-btn"
              className="btn btn-success"
              onClick={() => setShowStartModal(true)}
            >
              <Play size={14} /> {campaign.test_mode ? 'Start Test Campaign' : 'Start Campaign'}
            </button>
          )}
          {campaign.status === 'active' && (
            <button
              id="pause-campaign-btn"
              className="btn btn-secondary"
              onClick={() => handleAction('pause')}
              disabled={actionLoading === 'pause'}
            >
              <Pause size={14} /> Pause
            </button>
          )}
          {['active', 'paused'].includes(campaign.status) && (
            <button
              id="stop-campaign-btn"
              className="btn btn-danger"
              onClick={() => handleAction('stop')}
              disabled={actionLoading === 'stop'}
            >
              <Square size={14} /> Stop
            </button>
          )}
          {campaign.status === 'active' && (
            <button
              id="run-followups-btn"
              className="btn btn-primary"
              onClick={handleProcessFollowups}
              disabled={runningFollowups}
              title="Process due follow-ups immediately"
            >
              <Send size={14} /> {runningFollowups ? 'Processing...' : 'Run Follow-ups Now'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={load} id="refresh-btn">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {cronFeedback && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          {cronFeedback}
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card" style={{ '--accent-color': 'var(--brand-primary)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--brand-primary)' }}>{stats.total}</div>
            <div className="stat-label">Total Contacts</div>
          </div>
          <div className="stat-card" style={{ '--accent-color': '#64748b' } as React.CSSProperties}>
            <div className="stat-value">{stats.queued}</div>
            <div className="stat-label">Queued</div>
          </div>
          <div className="stat-card" style={{ '--accent-color': 'var(--color-info)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--color-info)' }}>{stats.sent}</div>
            <div className="stat-label">Email #1 Sent</div>
          </div>
          <div className="stat-card" style={{ '--accent-color': 'var(--brand-secondary)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--brand-secondary)' }}>{stats.opened}</div>
            <div className="stat-label">Opened</div>
          </div>
          <div className="stat-card" style={{ '--accent-color': 'var(--brand-coral)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--brand-coral)' }}>{stats.replied}</div>
            <div className="stat-label">Replied</div>
          </div>
          <div className="stat-card" style={{ '--accent-color': 'var(--brand-cyan)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--brand-cyan)' }}>{stats.follow_up_sent}</div>
            <div className="stat-label">Follow-up Sent</div>
          </div>
          <div className="stat-card" style={{ '--accent-color': 'var(--color-error)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--color-error)' }}>{stats.bounced}</div>
            <div className="stat-label">Bounced</div>
          </div>
          <div className="stat-card" style={{ '--accent-color': 'var(--color-warning)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--color-warning)' }}>{stats.unsubscribed}</div>
            <div className="stat-label">Unsubscribed</div>
          </div>
        </div>
      )}

      {/* Config & Test Send side-by-side */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Sequence config summary */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Configuration</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Initial Template</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{campaign.initial_template_id || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>No Open Template</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{campaign.no_open_template_id || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Opened No Reply</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{campaign.opened_no_reply_template_id || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>From</span>
              <span>{campaign.from_name} &lt;{campaign.from_email}&gt;</span>
            </div>
          </div>
        </div>

        {/* Send test email */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Send Test Email</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Verify your initial outreach template before starting the campaign.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              id="test-email-input"
              className="form-input"
              type="email"
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              id="send-test-btn"
              className="btn btn-secondary"
              onClick={sendTestEmail}
              disabled={testSending || !testEmail}
            >
              {testSending ? <span className="spinner" /> : <Send size={14} />}
            </button>
          </div>
          {testResult && (
            <div className={`alert ${testResult.success ? 'alert-success' : 'alert-error'}`}>
              {testResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Contacts section */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--bg-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Contacts ({contacts.length})</span>
            {stats && stats.queued > 0 && (
              <span className="badge badge-draft" style={{ fontSize: 11 }}>{stats.queued} queued</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              id="enroll-existing-btn"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowEnrollModal(true)}
            >
              <UserPlus size={14} /> Add from Database
            </button>
            <button
              id="import-csv-campaign-btn"
              className="btn btn-primary btn-sm"
              onClick={() => setShowImportModal(true)}
            >
              <Upload size={14} /> Import CSV
            </button>
          </div>
        </div>

        {contacts.length === 0 ? (
          <div className="empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, background: 'var(--brand-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <Users size={24} color="var(--brand-primary)" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No contacts in this campaign yet</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 440, margin: '0 auto 20px', lineHeight: 1.5 }}>
              Import a CSV file to add contacts directly to this campaign, or select from contacts already in your database.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                id="empty-import-csv-btn"
                className="btn btn-primary"
                onClick={() => setShowImportModal(true)}
              >
                <Upload size={14} /> Import CSV into Campaign
              </button>
              <button
                id="empty-enroll-existing-btn"
                className="btn btn-secondary"
                onClick={() => setShowEnrollModal(true)}
              >
                <UserPlus size={14} /> Add from Database Contacts
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Step</th>
                  <th>Status</th>
                  <th>Opened</th>
                  <th>Replied</th>
                  <th>Last Activity</th>
                  <th>Follow-up Due</th>
                  {['draft', 'paused'].includes(campaign.status) && <th style={{ width: 44 }}></th>}
                </tr>
              </thead>
              <tbody>
                {contacts.map((cc) => (
                  <tr key={cc.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {cc.contact.first_name} {cc.contact.last_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cc.contact.designation}</div>
                    </td>
                    <td>{cc.contact.company || '—'}</td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{cc.contact.email}</span></td>
                    <td style={{ textAlign: 'center' }}>#{cc.current_step}</td>
                    <td><StatusBadge status={cc.status} /></td>
                    <td>
                      <span style={{ color: cc.opened ? 'var(--color-success)' : 'var(--text-muted)', fontSize: 13 }}>
                        {cc.opened ? '✓' : '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: cc.replied ? 'var(--color-success)' : 'var(--text-muted)', fontSize: 13 }}>
                        {cc.replied ? '✓' : '—'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {formatDistanceToNow(new Date(cc.updated_at), { addSuffix: true })}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {cc.follow_up_due_at && !cc.follow_up_sent_at && !cc.replied && !cc.bounced
                        ? formatDistanceToNow(new Date(cc.follow_up_due_at), { addSuffix: true })
                        : cc.follow_up_sent_at
                        ? 'Sent'
                        : '—'}
                    </td>
                    {['draft', 'paused'].includes(campaign.status) && (
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 6px', color: 'var(--color-error)' }}
                          title="Remove from campaign"
                          disabled={removingContactId === cc.contact.id}
                          onClick={() => handleRemoveContact(cc.contact.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showStartModal && (
        <StartCampaignModal
          campaign={campaign}
          contactCount={stats?.total ?? 0}
          onConfirm={async () => { await handleStart(); setShowStartModal(false) }}
          onClose={() => setShowStartModal(false)}
        />
      )}

      {showImportModal && (
        <CampaignImportModal
          campaignId={campaign.id}
          campaignName={campaign.name}
          onImportComplete={() => {
            load()
          }}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {showEnrollModal && (
        <EnrollContactsModal
          campaignId={campaign.id}
          campaignName={campaign.name}
          alreadyEnrolledContactIds={contacts.map((c) => c.contact.id)}
          onEnrolled={() => {
            load()
          }}
          onClose={() => setShowEnrollModal(false)}
        />
      )}
    </div>
  )
}
