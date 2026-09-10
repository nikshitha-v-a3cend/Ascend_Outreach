'use client'

import { X, Upload } from 'lucide-react'
import { CSVImporter } from '@/components/contacts/CSVImporter'

interface CampaignImportModalProps {
  campaignId: string
  campaignName: string
  onImportComplete: () => void
  onClose: () => void
}

export function CampaignImportModal({
  campaignId,
  campaignName,
  onImportComplete,
  onClose,
}: CampaignImportModalProps) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--brand-glow)', display: 'flex',
              alignItems: 'center', justifyContent: 'center'
            }}>
              <Upload size={16} color="var(--brand-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Import Contacts into Campaign</h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{campaignName}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
            id="close-campaign-import-modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <CSVImporter
            campaignId={campaignId}
            campaignName={campaignName}
            onImportComplete={() => {
              onImportComplete()
            }}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  )
}
