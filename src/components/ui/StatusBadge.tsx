// src/components/ui/StatusBadge.tsx
'use client'

type Status =
  | 'queued' | 'sending' | 'sent' | 'opened' | 'no_open'
  | 'follow_up_sent' | 'replied' | 'bounced' | 'unsubscribed'
  | 'failed' | 'stopped' | 'draft' | 'active' | 'paused'
  | 'test_mode' | 'follow_up_sending'

const labelMap: Record<Status, string> = {
  queued: 'Queued',
  sending: 'Sending',
  sent: 'Sent',
  opened: 'Opened',
  no_open: 'No Open',
  follow_up_sent: 'Follow-up Sent',
  follow_up_sending: 'Sending...',
  replied: 'Replied',
  bounced: 'Bounced',
  unsubscribed: 'Unsubscribed',
  failed: 'Failed',
  stopped: 'Stopped',
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  test_mode: 'Test Mode',
}

const classMap: Record<Status, string> = {
  queued: 'badge-queued',
  sending: 'badge-sent',
  sent: 'badge-sent',
  opened: 'badge-opened',
  no_open: 'badge-no-open',
  follow_up_sent: 'badge-follow-up',
  follow_up_sending: 'badge-follow-up',
  replied: 'badge-replied',
  bounced: 'badge-bounced',
  unsubscribed: 'badge-unsubscribed',
  failed: 'badge-failed',
  stopped: 'badge-stopped',
  draft: 'badge-draft',
  active: 'badge-active',
  paused: 'badge-paused',
  test_mode: 'badge-test-mode',
}

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = status as Status
  const label = labelMap[s] ?? status
  const cls = classMap[s] ?? 'badge-queued'
  return <span className={`badge ${cls}`}>{label}</span>
}
