'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Copy } from 'lucide-react'

interface HealthData {
  database: string
  sendgrid: string
  from_email: string
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState('')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: HealthData) => setHealth(d))
      .finally(() => setLoading(false))
  }, [])

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  const webhookUrls = [
    {
      key: 'events',
      label: 'SendGrid Event Webhook',
      url: `${appUrl}/api/sendgrid/events`,
      note: 'Add to SendGrid → Settings → Mail Settings → Event Webhook',
    },
    {
      key: 'inbound',
      label: 'SendGrid Inbound Parse',
      url: `${appUrl}/api/sendgrid/inbound`,
      note: 'Add to SendGrid → Settings → Inbound Parse',
    },
    {
      key: 'cron',
      label: 'Follow-up Cron Endpoint',
      url: `${appUrl}/api/cron/process-followups`,
      note: 'Call every 5 minutes (test) or every 15 minutes (production) with Authorization: Bearer CRON_SECRET',
    },
  ]

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">System configuration and webhook URLs</p>
        </div>
      </div>

      {/* Connection status */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Connection Status</h3>
        {loading ? (
          <span className="spinner" style={{ width: 20, height: 20 }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Supabase Database', key: 'database', value: health?.database },
              { label: 'SendGrid API', key: 'sendgrid', value: health?.sendgrid },
              { label: 'From Email', key: 'from_email', value: health?.from_email },
            ].map(({ label, key, value }) => {
              const ok = value === 'ok' || value === 'configured'
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {ok
                    ? <CheckCircle size={18} color="var(--color-success)" />
                    : <XCircle size={18} color="var(--color-error)" />}
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: ok ? 'var(--color-success)' : 'var(--color-error)', fontFamily: 'monospace' }}>
                    {value ?? 'unknown'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Environment variables reference */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Required Environment Variables</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Set these in your <code style={{ fontFamily: 'monospace', background: 'var(--bg-surface-3)', padding: '1px 5px', borderRadius: 3 }}>.env.local</code> file.
          Never commit secrets to source control.
        </p>
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Purpose</th>
              <th>Exposed?</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['SENDGRID_API_KEY', 'SendGrid authentication', 'Server only ✗'],
              ['SENDGRID_FROM_EMAIL', 'Default sender email', 'Server only ✗'],
              ['SENDGRID_FROM_NAME', 'Default sender name', 'Server only ✗'],
              ['NEXT_PUBLIC_SUPABASE_URL', 'Supabase project URL', 'Browser ✓'],
              ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'Supabase anon key', 'Browser ✓'],
              ['SUPABASE_SECRET_KEY', 'Supabase service role', 'Server only ✗'],
              ['APP_URL', 'Public app URL', 'Server only ✗'],
              ['CRON_SECRET', 'Cron endpoint secret', 'Server only ✗'],
            ].map(([v, p, e]) => (
              <tr key={v}>
                <td><code style={{ fontFamily: 'monospace', color: 'var(--brand-primary)' }}>{v}</code></td>
                <td style={{ color: 'var(--text-secondary)' }}>{p}</td>
                <td style={{ color: e.includes('✓') ? 'var(--color-success)' : 'var(--color-warning)' }}>{e}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Webhook URLs */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Webhook URLs</h3>
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <span>⚠</span>
          <div>
            <strong>Local Development</strong>: SendGrid cannot reach <code>localhost</code>.
            Use <strong>ngrok</strong> or <strong>Cloudflare Tunnel</strong> to expose your local server:
            <pre style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-base)', padding: 8, borderRadius: 6 }}>
              {'ngrok http 3000\n# Then use the https://xxxxx.ngrok.io URL below'}
            </pre>
          </div>
        </div>
        {webhookUrls.map(({ key, label, url, note }) => (
          <div key={key} style={{ marginBottom: 16, padding: 16, background: 'var(--bg-surface-2)', borderRadius: 10, border: '1px solid var(--bg-border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{label}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <code style={{ fontSize: 12, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all', color: 'var(--text-secondary)' }}>
                {url}
              </code>
              <button
                id={`copy-${key}-btn`}
                className="btn btn-secondary btn-sm"
                onClick={() => copy(url, key)}
                style={{ flexShrink: 0 }}
              >
                {copied === key ? '✓' : <Copy size={12} />}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{note}</div>
          </div>
        ))}
      </div>

      {/* Test mode info */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #2a1f00, #1a1f00)', borderColor: '#f59e0b30' }}>
        <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, color: '#f59e0b' }}>Test Mode</h3>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p>Test mode is enabled by default on all new campaigns. In test mode:</p>
          <ul style={{ paddingLeft: 16, marginTop: 8 }}>
            <li>Use 5-minute follow-up delays for rapid testing</li>
            <li>A warning banner is displayed at all times</li>
            <li>Confirmation is required before starting any campaign</li>
            <li>Real emails are sent to real addresses — use your own test emails</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
