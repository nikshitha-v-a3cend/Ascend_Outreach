'use client'

import { useState, useEffect } from 'react'
import { X, Search, CheckCircle, UserPlus, Users, Loader } from 'lucide-react'
import type { Contact } from '@/lib/supabase/types'

interface EnrollContactsModalProps {
  campaignId: string
  campaignName: string
  alreadyEnrolledContactIds: string[]
  onEnrolled: () => void
  onClose: () => void
}

export function EnrollContactsModal({
  campaignId,
  campaignName,
  alreadyEnrolledContactIds,
  onEnrolled,
  onClose,
}: EnrollContactsModalProps) {
  const [allContacts, setAllContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/contacts/import')
      .then((r) => r.json())
      .then((data: { contacts: Contact[] }) => {
        const contacts = data.contacts ?? []
        setAllContacts(contacts)
        // Start with no contacts selected by default so user picks deliberately
        setSelectedIds(new Set())
      })
      .catch(() => setError('Failed to load contacts'))
      .finally(() => setLoading(false))
  }, [alreadyEnrolledContactIds])

  const enrolledSet = new Set(alreadyEnrolledContactIds)

  const filtered = allContacts.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.designation?.toLowerCase().includes(q)
    )
  })

  const availableFiltered = filtered.filter((c) => !enrolledSet.has(c.id))

  const toggleAll = () => {
    if (selectedIds.size === availableFiltered.length && availableFiltered.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(availableFiltered.map((c) => c.id)))
    }
  }

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleEnroll = async () => {
    if (selectedIds.size === 0) return
    setEnrolling(true)
    setError('')

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: Array.from(selectedIds) }),
      })

      const data = (await res.json()) as { added?: number; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed to enroll contacts')
      } else {
        setResult(`Successfully enrolled ${data.added ?? selectedIds.size} contacts into "${campaignName}".`)
        onEnrolled()
      }
    } catch {
      setError('Network error enrolling contacts')
    } finally {
      setEnrolling(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content" style={{ maxWidth: 640 }}>
        {/* Header */}
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
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Add Contacts to Campaign</h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{campaignName}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
            id="close-enroll-modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {result ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <CheckCircle size={44} color="var(--color-success)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Contacts Added!</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>{result}</div>
              <button className="btn btn-primary" onClick={onClose} id="done-enroll-btn">
                Done
              </button>
            </div>
          ) : (
            <>
              {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

              {/* Search & Actions Bar */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    id="search-enroll-contacts"
                    className="form-input"
                    placeholder="Search name, email, company..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ paddingLeft: 32, height: 36, fontSize: 13 }}
                  />
                </div>
                {availableFiltered.length > 0 && (
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={toggleAll}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {selectedIds.size === availableFiltered.length ? 'Deselect All' : 'Select All Available'}
                  </button>
                )}
              </div>

              {/* Contacts List */}
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 36 }}>
                  <span className="spinner" />
                </div>
              ) : allContacts.length === 0 ? (
                <div className="empty-state" style={{ padding: 24, textAlign: 'center' }}>
                  <Users size={32} color="var(--text-muted)" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>No contacts in database</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Import a CSV file to add contacts to your database first.
                  </div>
                </div>
              ) : (
                <div style={{
                  border: '1px solid var(--bg-border)',
                  borderRadius: 8,
                  maxHeight: 320,
                  overflowY: 'auto'
                }}>
                  <table className="data-table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}></th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Company</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c) => {
                        const isEnrolled = enrolledSet.has(c.id)
                        const isSelected = selectedIds.has(c.id)
                        return (
                          <tr
                            key={c.id}
                            style={{
                              opacity: isEnrolled ? 0.5 : 1,
                              cursor: isEnrolled ? 'default' : 'pointer',
                            }}
                            onClick={() => !isEnrolled && toggle(c.id)}
                          >
                            <td onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                id={`enroll-contact-${c.id}`}
                                disabled={isEnrolled}
                                checked={isSelected && !isEnrolled}
                                onChange={() => toggle(c.id)}
                              />
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</div>
                              {c.designation && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.designation}</div>
                              )}
                            </td>
                            <td>
                              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.email}</span>
                            </td>
                            <td style={{ color: 'var(--text-muted)' }}>{c.company || '—'}</td>
                            <td>
                              {isEnrolled ? (
                                <span style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 500 }}>
                                  ✓ In Campaign
                                </span>
                              ) : isSelected ? (
                                <span style={{ fontSize: 11, color: 'var(--brand-primary)', fontWeight: 500 }}>
                                  Selected
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  Available
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {!result && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose} disabled={enrolling}>
              Cancel
            </button>
            <button
              id="confirm-enroll-btn"
              className="btn btn-primary"
              disabled={selectedIds.size === 0 || enrolling}
              onClick={handleEnroll}
            >
              {enrolling ? (
                <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enrolling...</>
              ) : (
                <><UserPlus size={14} /> Add {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''} to Campaign</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
