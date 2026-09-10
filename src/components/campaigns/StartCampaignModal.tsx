'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle, X, Send, Loader } from 'lucide-react'
import type { Campaign } from '@/lib/supabase/types'

interface StartCampaignModalProps {
  campaign: Campaign
  contactCount: number
  onConfirm: () => Promise<void>
  onClose: () => void
}

export function StartCampaignModal({
  campaign,
  contactCount,
  onConfirm,
  onClose,
}: StartCampaignModalProps) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const delayLabel =
    campaign.follow_up_delay_minutes < 60
      ? `${campaign.follow_up_delay_minutes} minutes`
      : campaign.follow_up_delay_minutes < 1440
      ? `${Math.round(campaign.follow_up_delay_minutes / 60)} hours`
      : `${Math.round(campaign.follow_up_delay_minutes / 1440)} days`

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {campaign.test_mode && (
              <span className="badge badge-test-mode">
                <AlertTriangle size={11} />
                TEST MODE
              </span>
            )}
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>
              {campaign.test_mode ? 'Start Test Campaign' : 'Start Campaign'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
            id="modal-close-btn"
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {done ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <CheckCircle size={48} color="var(--color-success)" style={{ marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Campaign Started!</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Sending emails to {contactCount} contacts. Follow-ups will be processed automatically.
              </div>
              <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={onClose}>
                View Campaign
              </button>
            </div>
          ) : (
            <>
              {campaign.test_mode && (
                <div className="alert alert-warning" style={{ marginBottom: 20 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Test Mode Active</strong>
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      Emails will be sent to real addresses. Make sure test recipients are aware.
                    </div>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SummaryRow label="Campaign" value={campaign.name} />
                <SummaryRow label="Contacts" value={`${contactCount} recipient${contactCount !== 1 ? 's' : ''}`} highlight />
                <SummaryRow label="Emails that will send" value={`${contactCount} initial + up to ${contactCount} follow-ups`} highlight />
                <SummaryRow label="From" value={`${campaign.from_name} <${campaign.from_email}>`} />
                <SummaryRow label="Initial Template" value={campaign.initial_template_id ?? '(not set)'} code />
                <SummaryRow label="No Open Template" value={campaign.no_open_template_id ?? '(not set)'} code />
                <SummaryRow label="Opened No Reply Template" value={campaign.opened_no_reply_template_id ?? '(not set)'} code />
                <SummaryRow label="Follow-up Delay" value={delayLabel} highlight />
                <SummaryRow label="Mode" value={campaign.test_mode ? 'TEST MODE' : 'Production'} />
              </div>

              {!campaign.initial_template_id && (
                <div className="alert alert-error" style={{ marginTop: 16 }}>
                  <AlertTriangle size={16} />
                  Initial template ID is not configured. Set it in campaign settings before starting.
                </div>
              )}
            </>
          )}
        </div>

        {!done && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose} disabled={loading} id="cancel-start-btn">
              Cancel
            </button>
            <button
              id="confirm-start-campaign-btn"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={loading || !campaign.initial_template_id}
            >
              {loading ? (
                <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Starting...</>
              ) : (
                <><Send size={15} /> {campaign.test_mode ? 'Start Test Campaign' : 'Start Campaign'}</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  highlight,
  code,
}: {
  label: string
  value: string
  highlight?: boolean
  code?: boolean
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '10px 0',
      borderBottom: '1px solid var(--bg-border-subtle)',
    }}>
      <div style={{ width: 160, flexShrink: 0, fontSize: 13, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{
        fontSize: 13,
        fontWeight: highlight ? 600 : 400,
        color: highlight ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontFamily: code ? 'monospace' : 'inherit',
        wordBreak: 'break-all',
      }}>
        {value}
      </div>
    </div>
  )
}
