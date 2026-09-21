'use client'

import { useState } from 'react'
import { X, UserPlus, CheckCircle, Loader } from 'lucide-react'

interface AddContactModalProps {
  campaignId: string
  campaignName: string
  onAdded: () => void
  onClose: () => void
}

const emptyForm = { first_name: '', last_name: '', email: '', company: '', designation: '', linkedin_url: '', company_domain: '' }

export function AddContactModal({
  campaignId,
  campaignName,
  onAdded,
  onClose,
}: AddContactModalProps) {
  const [form, setForm] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState<Partial<typeof emptyForm>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const validate = () => {
    const errs: Partial<typeof emptyForm> = {}
    if (!form.first_name.trim()) errs.first_name = 'First name is required'
    if (!form.email.trim()) errs.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email address'
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return }
    setFormErrors({})
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: [{
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim() || undefined,
            email: form.email.trim().toLowerCase(),
            company: form.company.trim() || undefined,
            designation: form.designation.trim() || undefined,
            linkedin_url: form.linkedin_url.trim() || undefined,
            company_domain: form.company_domain.trim() || undefined,
          }],
          campaign_id: campaignId,
        }),
      })

      const data = (await res.json()) as { error?: string; enrolled?: number }
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to add contact')
      } else {
        setResult(`${form.first_name} was added to "${campaignName}".`)
        onAdded()
      }
    } catch {
      setError('Network error adding contact')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--brand-glow)', display: 'flex',
              alignItems: 'center', justifyContent: 'center'
            }}>
              <UserPlus size={16} color="var(--brand-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Add Contact</h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{campaignName}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
            id="close-add-contact-modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {result ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <CheckCircle size={44} color="var(--color-success)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Contact Added!</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>{result}</div>
              <button className="btn btn-primary" onClick={onClose} id="done-add-contact-btn">
                Done
              </button>
            </div>
          ) : (
            <form id="add-contact-form" onSubmit={handleSubmit} noValidate>
              {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="form-label" htmlFor="add-contact-first-name">
                    First Name <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <input
                    id="add-contact-first-name"
                    className="form-input"
                    placeholder="e.g. Priya"
                    value={form.first_name}
                    onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                    style={formErrors.first_name ? { borderColor: 'var(--color-error)' } : {}}
                  />
                  {formErrors.first_name && (
                    <span style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 4, display: 'block' }}>
                      {formErrors.first_name}
                    </span>
                  )}
                </div>
                <div>
                  <label className="form-label" htmlFor="add-contact-last-name">Last Name</label>
                  <input
                    id="add-contact-last-name"
                    className="form-input"
                    placeholder="e.g. Sharma"
                    value={form.last_name}
                    onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="form-label" htmlFor="add-contact-email">
                  Email Address <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <input
                  id="add-contact-email"
                  type="email"
                  className="form-input"
                  placeholder="e.g. priya.sharma@company.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  style={formErrors.email ? { borderColor: 'var(--color-error)' } : {}}
                />
                {formErrors.email && (
                  <span style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 4, display: 'block' }}>
                    {formErrors.email}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="form-label" htmlFor="add-contact-company">Company</label>
                  <input
                    id="add-contact-company"
                    className="form-input"
                    placeholder="e.g. Infosys, TCS..."
                    value={form.company}
                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="add-contact-designation">Designation</label>
                  <input
                    id="add-contact-designation"
                    className="form-input"
                    placeholder="e.g. VP Engineering"
                    value={form.designation}
                    onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="form-label" htmlFor="add-contact-linkedin">LinkedIn URL (optional)</label>
                  <input
                    id="add-contact-linkedin"
                    className="form-input"
                    placeholder="linkedin.com/in/..."
                    value={form.linkedin_url}
                    onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="add-contact-domain">Company Website (optional)</label>
                  <input
                    id="add-contact-domain"
                    className="form-input"
                    placeholder="e.g. company.com"
                    value={form.company_domain}
                    onChange={(e) => setForm((f) => ({ ...f, company_domain: e.target.value }))}
                  />
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>
                If known, these sharpen the AI research used to personalize emails — otherwise it searches by name and company alone.
              </span>
            </form>
          )}
        </div>

        {!result && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              id="confirm-add-contact-btn"
              type="submit"
              form="add-contact-form"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? (
                <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Adding...</>
              ) : (
                <><UserPlus size={14} /> Add to Campaign</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
