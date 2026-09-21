'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'

const DELAY_OPTIONS = [
  { label: '5 minutes (Test)', value: 5 },
  { label: '30 minutes (Test)', value: 30 },
  { label: '1 hour (Test)', value: 60 },
  { label: '1 day', value: 1440 },
  { label: '2 days (Default)', value: 2880 },
  { label: '3 days', value: 4320 },
  { label: '5 days', value: 7200 },
  { label: '7 days', value: 10080 },
  { label: 'Custom (minutes)', value: 0 },
]

export default function NewCampaignPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [customDelay, setCustomDelay] = useState('')
  const [autoEnroll, setAutoEnroll] = useState(false)
  const [availableContacts, setAvailableContacts] = useState<Array<{ id: string; first_name: string; email: string }>>([])
  const [form, setForm] = useState({
    name: 'A3CEND Outreach Sequence',
    from_name: process.env.NEXT_PUBLIC_SENDGRID_FROM_NAME ?? '',
    from_email: process.env.NEXT_PUBLIC_SENDGRID_FROM_EMAIL ?? '',
    from_title: 'Enterprise Solutions & Growth',
    initial_template_id: process.env.NEXT_PUBLIC_INITIAL_TEMPLATE_ID ?? 'd-99cb8ad040a146cbb7b83277df6014fd',
    no_open_template_id: process.env.NEXT_PUBLIC_NO_OPEN_TEMPLATE_ID ?? 'd-35192641bf8a4ddc9933d1f191dc6cf1',
    opened_no_reply_template_id: process.env.NEXT_PUBLIC_OPENED_NO_REPLY_TEMPLATE_ID ?? 'd-991c648e50bb4c1c848587b89f2fa9f4',
    follow_up_delay_minutes: 5,
    custom_instructions: '',
    messaging_guidelines: '',
    target_tone: 'Professional & Consultative',
    test_mode: true,
  })

  useEffect(() => {
    fetch('/api/contacts/import')
      .then((r) => r.json())
      .then((d: { contacts?: Array<{ id: string; first_name: string; email: string }> }) => {
        setAvailableContacts(d.contacts ?? [])
      })
      .catch(() => {})
  }, [])

  const set = (field: string, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [field]: value }))

  const handleDelayChange = (value: string) => {
    const num = parseInt(value)
    if (num === 0) {
      set('follow_up_delay_minutes', 5) // default until custom entered
    } else {
      set('follow_up_delay_minutes', num)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    const delay =
      form.follow_up_delay_minutes === 0
        ? parseInt(customDelay) || 5
        : form.follow_up_delay_minutes

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, follow_up_delay_minutes: delay }),
      })
      const data = (await res.json()) as { campaign?: { id: string }; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed to create campaign')
      } else {
        const campaignId = data.campaign!.id
        if (autoEnroll && availableContacts.length > 0) {
          try {
            await fetch(`/api/campaigns/${campaignId}/contacts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contact_ids: availableContacts.map((c) => c.id) }),
            })
          } catch {
            // non-fatal: campaign created anyway
          }
        }
        router.push(`/campaigns/${campaignId}`)
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const showCustom = form.follow_up_delay_minutes === 0

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/campaigns" className="btn btn-secondary btn-sm" id="back-to-campaigns"><ArrowLeft size={14} /></Link>
          <div>
            <h1 className="page-title">New Campaign</h1>
            <p className="page-subtitle">Configure your outreach sequence</p>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Basic info */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Campaign Details</h3>

          <div className="form-group">
            <label className="form-label" htmlFor="campaign-name">Campaign Name *</label>
            <input
              id="campaign-name"
              className="form-input"
              placeholder="e.g. Q3 Tech Leads Outreach"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
          </div>

          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="from-name">From Name *</label>
              <input
                id="from-name"
                className="form-input"
                placeholder="Your Name (e.g. Nikshitha V)"
                value={form.from_name}
                onChange={(e) => set('from_name', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="from-title">Sender Title / Designation</label>
              <input
                id="from-title"
                className="form-input"
                placeholder="e.g. Enterprise Solutions & Growth"
                value={form.from_title}
                onChange={(e) => set('from_title', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="from-email">From Email *</label>
              <input
                id="from-email"
                className="form-input"
                type="email"
                placeholder="you@company.com"
                value={form.from_email}
                onChange={(e) => set('from_email', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="test-mode"
                checked={form.test_mode}
                onChange={(e) => set('test_mode', e.target.checked)}
              />
              <label htmlFor="test-mode" style={{ cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}>
                Enable Test Mode <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(recommended)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Templates */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>SendGrid Template IDs</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Enter your SendGrid Dynamic Template IDs (start with d-). Find these in your SendGrid dashboard.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="initial-template">Initial Outreach Template ID</label>
            <input
              id="initial-template"
              className="form-input"
              placeholder="d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={form.initial_template_id}
              onChange={(e) => set('initial_template_id', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="no-open-template">No Open Template ID</label>
            <input
              id="no-open-template"
              className="form-input"
              placeholder="d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={form.no_open_template_id}
              onChange={(e) => set('no_open_template_id', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="opened-no-reply-template">Opened No Reply Template ID</label>
            <input
              id="opened-no-reply-template"
              className="form-input"
              placeholder="d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={form.opened_no_reply_template_id}
              onChange={(e) => set('opened_no_reply_template_id', e.target.value)}
            />
          </div>
        </div>

        {/* Timing */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Follow-up Timing</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              How long to wait before sending a follow-up. In test mode, use 5 minutes to test the full workflow quickly.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="delay-select">Follow-up Delay</label>
            <select
              id="delay-select"
              className="form-select"
              value={form.follow_up_delay_minutes}
              onChange={(e) => handleDelayChange(e.target.value)}
            >
              {DELAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {showCustom && (
            <div className="form-group">
              <label className="form-label" htmlFor="custom-delay">Custom Delay (minutes, min 5)</label>
              <input
                id="custom-delay"
                className="form-input"
                type="number"
                min={5}
                placeholder="e.g. 120"
                value={customDelay}
                onChange={(e) => setCustomDelay(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* AI Personalization & Strategy */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, background: 'rgba(99, 102, 241, 0.03)', borderColor: 'rgba(99, 102, 241, 0.25)' }}>
          <div>
            <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, color: '#4f46e5' }}>
              ✨ AI Personalization & Strategy Guidelines
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Provide custom instructions for the AI copywriter (e.g. key products to emphasize, tone of voice, or specific value propositions).
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="custom-instructions">Custom AI Instructions / Angle</label>
            <textarea
              id="custom-instructions"
              className="form-input"
              rows={3}
              placeholder="e.g. Focus on helping new delivery leads and consultants get ready for real client meetings without senior managers having to shadow every call."
              value={form.custom_instructions}
              onChange={(e) => set('custom_instructions', e.target.value)}
            />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="messaging-guidelines">Messaging Guidelines / CTA Focus</label>
              <input
                id="messaging-guidelines"
                className="form-input"
                placeholder="e.g. Ask if they would like a quick 60-second video preview"
                value={form.messaging_guidelines}
                onChange={(e) => set('messaging_guidelines', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="target-tone">Target Tone</label>
              <select
                id="target-tone"
                className="form-select"
                value={form.target_tone}
                onChange={(e) => set('target_tone', e.target.value)}
              >
                <option value="Technical & Direct">Technical & Direct</option>
                <option value="Professional & Consultative">Professional & Consultative</option>
                <option value="Executive Peer-to-Peer">Executive Peer-to-Peer</option>
                <option value="Brief & High-Impact">Brief & High-Impact</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contact Enrollment */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Contacts Enrollment</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Choose whether to enroll existing database contacts now or import later.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input
              type="checkbox"
              id="auto-enroll-checkbox"
              checked={autoEnroll}
              onChange={(e) => setAutoEnroll(e.target.checked)}
              style={{ marginTop: 3, cursor: 'pointer' }}
            />
            <div>
              <label htmlFor="auto-enroll-checkbox" style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                Auto-enroll all {availableContacts.length} existing contacts from database
              </label>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {availableContacts.length > 0
                  ? `These ${availableContacts.length} contacts will be immediately queued in this campaign.`
                  : 'No contacts in database yet. You can also import CSV files directly on the campaign page.'}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="submit"
            id="save-campaign-btn"
            className="btn btn-primary btn-lg"
            disabled={saving}
          >
            {saving ? <><span className="spinner" />&nbsp;Creating...</> : <><Save size={16} /> Create Campaign</>}
          </button>
          <Link href="/campaigns" className="btn btn-secondary btn-lg">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
