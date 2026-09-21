'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Play, Pause, Square, Send, RefreshCw, Upload, UserPlus, UserPlus2, Trash2, Users, MessageSquare, Sparkles, RotateCcw, Check } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StartCampaignModal } from '@/components/campaigns/StartCampaignModal'
import { EnrollContactsModal } from '@/components/campaigns/EnrollContactsModal'
import { AddContactModal } from '@/components/campaigns/AddContactModal'
import { CampaignImportModal } from '@/components/campaigns/CampaignImportModal'
import { AIDecisionModal } from '@/components/campaigns/AIDecisionModal'
import { formatDistanceToNow } from 'date-fns'
import type { Campaign, Contact } from '@/lib/supabase/types'

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
  email_1_opened_at?: string | null
  email_1_replied_at?: string | null
  follow_up_sent_at: string | null
  follow_up_due_at: string | null
  updated_at: string
  contact: Contact
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
  const [showAddContactModal, setShowAddContactModal] = useState(false)
  const [selectedAIContact, setSelectedAIContact] = useState<Contact | null>(null)
  const [removingContactId, setRemovingContactId] = useState<string | null>(null)
  const [markingRepliedId, setMarkingRepliedId] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [actionLoading, setActionLoading] = useState('')

function safeFormatDistance(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return '—'
  }
}

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/campaigns/${id}`).then((r) => r.json()),
      fetch(`/api/campaigns/${id}/contacts?limit=200`).then((r) => r.json()),
    ]).then(([campData, contactsData]: [
      { campaign: Campaign; stats: CampaignStats },
      { contacts: CampaignContact[] }
    ]) => {
      if (campData?.campaign) setCampaign(campData.campaign)
      if (campData?.stats) setStats(campData.stats)
      setContacts(contactsData?.contacts ?? [])
    }).catch((err) => {
      console.warn('[Page] Error loading campaign data:', err)
    }).finally(() => setLoading(false))
  }, [id])

  const [lastOpenSync, setLastOpenSync] = useState<Date | null>(null)
  const [lastFollowupRun, setLastFollowupRun] = useState<Date | null>(null)
  const [bgSyncing, setBgSyncing] = useState(false)

  useEffect(() => { load() }, [load])

  // Consolidated background runner: waits 10s after mount, then runs every 30s
  useEffect(() => {
    let timer: NodeJS.Timeout
    const tick = async () => {
      setBgSyncing(true)
      try {
        const res = await fetch(`/api/campaigns/${id}/sync-sendgrid`, { method: 'POST' })
        if (res.ok) setLastOpenSync(new Date())
      } catch { /* silent */ } finally {
        setBgSyncing(false)
      }

      if (campaign?.status === 'active') {
        try {
          const res = await fetch('/api/cron/process-followups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign_id: id, force: false }),
          })
          const data = await res.json() as { followup_sent?: number; enrolled_sent?: number }
          if ((data.followup_sent && data.followup_sent > 0) || (data.enrolled_sent && data.enrolled_sent > 0)) {
            setLastFollowupRun(new Date())
          }
        } catch { /* silent */ }
      }

      load()
    }

    const startDelay = setTimeout(() => {
      timer = setInterval(tick, 30_000)
    }, 10_000)

    return () => {
      clearTimeout(startDelay)
      if (timer) clearInterval(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, campaign?.status])

  const [runningFollowups, setRunningFollowups] = useState(false)
  const [syncingSendgrid, setSyncingSendgrid] = useState(false)
  const [cronFeedback, setCronFeedback] = useState<string | null>(null)

  const handleSyncSendgrid = async () => {
    setSyncingSendgrid(true)
    setCronFeedback(null)
    try {
      const res = await fetch(`/api/campaigns/${id}/sync-sendgrid`, { method: 'POST' })
      const data = await res.json() as { message?: string; error?: string }
      setCronFeedback(data.message || data.error || 'SendGrid sync complete.')
      load()
    } catch {
      setCronFeedback('Failed to sync with SendGrid.')
    } finally {
      setSyncingSendgrid(false)
    }
  }

  const [resettingContactId, setResettingContactId] = useState<string | null>(null)
  const [resettingAll, setResettingAll] = useState(false)
  const [loggingReplyId, setLoggingReplyId] = useState<string | null>(null)

  const handleResetAllContacts = async () => {
    if (!confirm('Reset ALL contacts in this campaign back to Step 0 (queued)? This will let you test the entire outreach flow from scratch.')) return
    setResettingAll(true)
    try {
      await fetch(`/api/campaigns/${id}/contacts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_all: true }),
      })
      setCronFeedback('All contacts have been reset to Step 0 (queued)!')
      load()
    } finally {
      setResettingAll(false)
    }
  }

  const handleLogManualReply = async (ccId: string) => {
    if (!confirm('Log that your team sent a manual reply to this prospect? If they do not respond back within the follow-up delay, the system will schedule an automated re-engagement follow-up.')) return
    setLoggingReplyId(ccId)
    try {
      await fetch(`/api/campaigns/${id}/contacts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_contact_id: ccId, manual_reply: true }),
      })
      setCronFeedback('Manual reply logged! The system is now awaiting the prospect’s response before re-engaging.')
      load()
    } finally {
      setLoggingReplyId(null)
    }
  }

  const handleProcessFollowups = async () => {
    setRunningFollowups(true)
    setCronFeedback(null)
    try {
      const res = await fetch('/api/cron/process-followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: id,
          force: true,
        }),
      })
      const data = await res.json() as {
        processed?: number
        followup_processed?: number
        sent?: number
        followup_sent?: number
        enrolled_sent?: number
        skipped?: number
        followup_skipped?: number
        message?: string
      }
      if (data.enrolled_sent && data.enrolled_sent > 0 && data.followup_sent && data.followup_sent > 0) {
        setCronFeedback(`⚡ Sent ${data.enrolled_sent} initial email(s) and ${data.followup_sent} follow-up email(s).`)
        setLastFollowupRun(new Date())
      } else if (data.enrolled_sent && data.enrolled_sent > 0) {
        setCronFeedback(`⚡ Sent ${data.enrolled_sent} initial email(s)! Follow-ups scheduled after the delay period.`)
        setLastFollowupRun(new Date())
      } else if (data.followup_sent && data.followup_sent > 0) {
        setCronFeedback(`⚡ Success: Sent ${data.followup_sent} follow-up email(s) dynamically!`)
        setLastFollowupRun(new Date())
      } else {
        setCronFeedback(data.message || 'No contacts currently due for emails (contacts are waiting for their delay period, replied, or completed).')
      }
      load()
    } catch {
      setCronFeedback('Failed to process follow-ups.')
    } finally {
      setRunningFollowups(false)
    }
  }

  const handleResetContact = async (ccId: string) => {
    if (!confirm('Reset this contact back to Step 0 (queued)? This allows you to re-test the entire outreach sequence from the start.')) return
    setResettingContactId(ccId)
    try {
      await fetch(`/api/campaigns/${id}/contacts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_contact_id: ccId, reset: true }),
      })
      load()
    } finally {
      setResettingContactId(null)
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

  const handleMarkReplied = async (ccId: string) => {
    if (!confirm('Mark this contact as replied? This will stop further follow-ups for them.')) return
    setMarkingRepliedId(ccId)
    try {
      await fetch(`/api/campaigns/${id}/contacts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_contact_id: ccId, replied: true }),
      })
      load()
    } finally {
      setMarkingRepliedId(null)
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
      <div className="page-header" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/campaigns" className="btn btn-secondary btn-sm" id="back-btn"><ArrowLeft size={14} /></Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h1 className="page-title" style={{ margin: 0 }}>{campaign.name}</h1>
              <StatusBadge status={campaign.status} />
              {campaign.test_mode && <StatusBadge status="test_mode" />}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
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
          <button
            id="reset-all-btn"
            className="btn btn-secondary"
            onClick={handleResetAllContacts}
            disabled={resettingAll}
            title="Reset all contacts back to Step 0 (queued) to re-test the outreach sequence from scratch"
          >
            <RotateCcw size={14} /> {resettingAll ? 'Resetting...' : 'Reset All to Step 0'}
          </button>
          <button
            id="sync-sendgrid-btn"
            className="btn btn-secondary"
            onClick={handleSyncSendgrid}
            disabled={syncingSendgrid}
            title="Pull latest verified opens directly from SendGrid Activity API"
          >
            <RefreshCw size={14} /> {syncingSendgrid ? 'Syncing SendGrid...' : 'Sync SendGrid Opens'}
          </button>
          <button className="btn btn-secondary" onClick={() => load()} id="refresh-btn">
            <RefreshCw size={14} /> Refresh
          </button>
          {/* Automation status indicator */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 2, alignSelf: 'center',
            background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
            borderRadius: 8, padding: '5px 10px', fontSize: 11, color: 'var(--text-muted)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: bgSyncing ? '#f59e0b' : 'var(--color-success)',
                display: 'inline-block',
              }} />
              Opens: {bgSyncing ? 'Syncing…' : lastOpenSync ? `synced ${lastOpenSync.toLocaleTimeString()}` : 'syncs every 60s'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: campaign?.status === 'active' ? 'var(--color-success)' : '#64748b',
                display: 'inline-block',
              }} />
              Follow-ups: {campaign?.status === 'active'
                ? lastFollowupRun ? `ran ${lastFollowupRun.toLocaleTimeString()}` : 'Manual or Cron'
                : 'paused (campaign inactive)'}
            </span>
          </div>
        </div>
      </div>

      {cronFeedback && (
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          {cronFeedback}
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: 14, gap: 10 }}>
          <div className="stat-card stat-card-compact" style={{ '--accent-color': 'var(--brand-primary)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--brand-primary)' }}>{stats.total}</div>
            <div className="stat-label">Total Contacts</div>
          </div>
          <div className="stat-card stat-card-compact" style={{ '--accent-color': '#64748b' } as React.CSSProperties}>
            <div className="stat-value">{stats.queued}</div>
            <div className="stat-label">Queued</div>
          </div>
          <div className="stat-card stat-card-compact" style={{ '--accent-color': 'var(--color-info)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--color-info)' }}>{stats.sent}</div>
            <div className="stat-label">Email #1 Sent</div>
          </div>
          <div className="stat-card stat-card-compact" style={{ '--accent-color': 'var(--brand-secondary)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--brand-secondary)' }}>{stats.opened}</div>
            <div className="stat-label">Opened</div>
          </div>
          <div className="stat-card stat-card-compact" style={{ '--accent-color': 'var(--brand-coral)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--brand-coral)' }}>{stats.replied}</div>
            <div className="stat-label">Replied</div>
          </div>
          <div className="stat-card stat-card-compact" style={{ '--accent-color': 'var(--brand-cyan)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--brand-cyan)' }}>{stats.follow_up_sent}</div>
            <div className="stat-label">Follow-up Sent</div>
          </div>
          <div className="stat-card stat-card-compact" style={{ '--accent-color': 'var(--color-error)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--color-error)' }}>{stats.bounced}</div>
            <div className="stat-label">Bounced</div>
          </div>
          <div className="stat-card stat-card-compact" style={{ '--accent-color': 'var(--color-warning)' } as React.CSSProperties}>
            <div className="stat-value" style={{ color: 'var(--color-warning)' }}>{stats.unsubscribed}</div>
            <div className="stat-label">Unsubscribed</div>
          </div>
        </div>
      )}

      {/* Config & Test Send side-by-side */}
      <div className="grid-2" style={{ marginBottom: 14, gap: 12 }}>
        {/* Sequence config summary */}
        <div className="card card-compact">
          <h3 style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Configuration</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
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
        <div className="card card-compact">
          <h3 style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Send Test Email</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Verify your initial outreach template before starting the campaign.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
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
              id="add-contact-manual-btn"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAddContactModal(true)}
            >
              <UserPlus2 size={14} /> Add Contact
            </button>
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
              <button
                id="empty-add-contact-manual-btn"
                className="btn btn-secondary"
                onClick={() => setShowAddContactModal(true)}
              >
                <UserPlus2 size={14} /> Add Contact Manually
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
                  <th>Actions</th>
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
                      {cc.opened ? (
                        <span style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Check size={13} strokeWidth={2.5} /> Opened
                        </span>
                      ) : cc.current_step > 0 ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          Not opened
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      {cc.replied ? (
                        <span style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Check size={13} strokeWidth={2.5} /> Replied
                        </span>
                      ) : cc.current_step > 0 ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          No reply
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            color: 'var(--brand-primary)',
                            borderColor: 'rgba(2, 128, 151, 0.35)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title="Inspect AI profile, classification, decision reasoning, and preview tailored email"
                          onClick={() => setSelectedAIContact(cc.contact)}
                        >
                          <Sparkles size={11} /> AI Intel
                        </button>
                        {!cc.replied && cc.status !== 'manual_reply_sent' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: 11, padding: '3px 8px', color: 'var(--brand-secondary)' }}
                            title="Mark as replied (they replied directly to your inbox)"
                            disabled={markingRepliedId === cc.id}
                            onClick={() => handleMarkReplied(cc.id)}
                          >
                            <MessageSquare size={11} /> {markingRepliedId === cc.id ? '...' : 'Mark Replied'}
                          </button>
                        )}
                        {cc.replied && cc.status !== 'manual_reply_sent' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: 11, padding: '3px 8px', color: 'var(--brand-primary)', borderColor: 'rgba(2, 128, 151, 0.4)' }}
                            title="Click after your team replies manually. If prospect doesn't respond back, automated re-engagement follow-up will resume."
                            disabled={loggingReplyId === cc.id}
                            onClick={() => handleLogManualReply(cc.id)}
                          >
                            <Send size={11} /> {loggingReplyId === cc.id ? '...' : 'Team Replied'}
                          </button>
                        )}
                        {cc.status === 'manual_reply_sent' && (
                          <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>⏳ Awaiting Prospect</span>
                        )}
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11, padding: '3px 8px', color: 'var(--text-muted)' }}
                          title="Reset contact to Step 0 (queued) to re-test the outreach sequence from scratch"
                          disabled={resettingContactId === cc.id}
                          onClick={() => handleResetContact(cc.id)}
                        >
                          <RotateCcw size={11} /> {resettingContactId === cc.id ? '...' : 'Reset'}
                        </button>
                        {cc.replied && cc.status !== 'manual_reply_sent' && (
                          <span style={{ fontSize: 11, color: 'var(--color-success)' }}>✓ Replied</span>
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {(() => {
                        const activityTime = cc.email_1_replied_at || cc.email_1_opened_at || cc.email_1_sent_at
                        return safeFormatDistance(activityTime)
                      })()}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {cc.status === 'manual_reply_sent'
                        ? cc.follow_up_due_at
                          ? `Re-engagement ${safeFormatDistance(cc.follow_up_due_at)}`
                          : 'Awaiting Prospect'
                        : cc.replied
                        ? 'Replied (Stopped)'
                        : cc.bounced
                        ? 'Bounced'
                        : cc.status === 'queued'
                        ? 'Queued for Email #1'
                        : cc.current_step >= 5
                        ? 'Sequence Complete (5/5 Finished)'
                        : cc.current_step >= 2
                        ? 'Automated Done (2/2) · Paused'
                        : cc.follow_up_due_at && !isNaN(new Date(cc.follow_up_due_at).getTime()) && new Date(cc.follow_up_due_at) > new Date()
                        ? `Follow-up due ${safeFormatDistance(cc.follow_up_due_at)}`
                        : cc.current_step === 1
                        ? 'Sending Follow-up #1 on next tick...'
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

      {showAddContactModal && (
        <AddContactModal
          campaignId={campaign.id}
          campaignName={campaign.name}
          onAdded={() => {
            load()
          }}
          onClose={() => setShowAddContactModal(false)}
        />
      )}

      {selectedAIContact && (
        <AIDecisionModal
          campaignId={campaign.id}
          contact={selectedAIContact}
          onClose={() => setSelectedAIContact(null)}
          onSent={() => {
            load()
          }}
        />
      )}
    </div>
  )
}
