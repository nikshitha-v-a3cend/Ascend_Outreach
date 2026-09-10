'use client'

import { useState } from 'react'
import { Mail, TestTube } from 'lucide-react'

const TEMPLATES = [
  { key: 'initial_outreach', id: 'd-99cb8ad040a146cbb7b83277df6014fd', label: 'Initial Outreach', description: 'First email sent to contacts when a campaign starts' },
  { key: 'opened_no_reply', id: 'd-991c648e50bb4c1c848587b89f2fa9f4', label: 'Opened (No Reply)', description: 'Sent when contact opened Email #1 but did not reply after delay period' },
  { key: 'no_open', id: 'd-35192641bf8a4ddc9933d1f191dc6cf1', label: 'No Open Follow-up', description: 'Sent when contact did not open Email #1 after the delay period' },
]

export default function TemplatesPage() {
  const [campaignId, setCampaignId] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('initial_outreach')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const sendTest = async () => {
    if (!campaignId || !testEmail) return
    setSending(true)
    setResult(null)
    const res = await fetch(`/api/campaigns/${campaignId}/send-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test_email: testEmail, template_type: selectedTemplate }),
    })
    const data = await res.json() as { success: boolean; message?: string; error?: string }
    setResult({ success: data.success, message: data.message ?? data.error ?? '' })
    setSending(false)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">SendGrid Dynamic Template configuration</p>
        </div>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 24 }}>
        <Mail size={16} style={{ flexShrink: 0 }} />
        <div>
          Template content is managed directly in your <strong>SendGrid Dashboard</strong> under Email API → Dynamic Templates.
          Configure the template IDs in each campaign.
        </div>
      </div>

      {/* Template info cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
        {TEMPLATES.map((t) => (
          <div key={t.key} className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: 'var(--brand-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Mail size={18} color="var(--brand-primary)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{t.description}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  Field: <code style={{ background: 'var(--bg-surface-3)', padding: '2px 6px', borderRadius: 4 }}>{t.key}_template_id</code>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  ID: <code style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', padding: '2px 6px', borderRadius: 4 }}>{t.id}</code>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Personalization variables */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Personalization Variables</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Use these variables in your SendGrid templates via <code style={{ fontFamily: 'monospace' }}>{'{{variable}}'}</code>:
        </p>
        <table className="data-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Maps From (CSV)</th>
              <th>Example Value</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['{{firstName}}', 'Name', 'John'],
              ['{{lastName}}', 'Last Name', 'Smith'],
              ['{{email}}', 'Email', 'john@company.com'],
              ['{{company}}', 'Company', 'Acme Corp'],
              ['{{designation}}', 'Designation', 'CTO'],
            ].map(([v, c, e]) => (
              <tr key={v}>
                <td><code style={{ fontFamily: 'monospace', color: 'var(--brand-primary)' }}>{v}</code></td>
                <td>{c}</td>
                <td style={{ color: 'var(--text-muted)' }}>{e}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Test template */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <TestTube size={18} color="var(--brand-primary)" />
          <h3 style={{ fontWeight: 600, fontSize: 15 }}>Test Template</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="template-campaign-id">Campaign ID</label>
            <input
              id="template-campaign-id"
              className="form-input"
              placeholder="Enter campaign UUID"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="template-test-email">Test Email</label>
            <input
              id="template-test-email"
              className="form-input"
              type="email"
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="template-select">Template</label>
            <select
              id="template-select"
              className="form-select"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              {TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>
          <button
            id="send-template-test-btn"
            className="btn btn-primary"
            onClick={sendTest}
            disabled={!campaignId || !testEmail || sending}
          >
            {sending ? <><span className="spinner" /> Sending...</> : <><Mail size={14} /> Send Test</>}
          </button>
          {result && (
            <div className={`alert ${result.success ? 'alert-success' : 'alert-error'}`}>
              {result.message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
