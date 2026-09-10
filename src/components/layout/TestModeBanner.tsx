'use client'

import { AlertTriangle } from 'lucide-react'

export function TestModeBanner() {
  return (
    <div className="test-mode-banner">
      <AlertTriangle size={14} />
      <span>
        <strong>TEST MODE</strong> — Safe testing environment. No production emails will be affected.
        Use 5-minute delays for rapid testing.
      </span>
    </div>
  )
}
