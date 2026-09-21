'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Search, Trash2, Sparkles, Pencil } from 'lucide-react'
import { CSVImporter } from '@/components/contacts/CSVImporter'
import { ApifyEnrichmentModal } from '@/components/contacts/ApifyEnrichmentModal'
import { EditContactModal } from '@/components/contacts/EditContactModal'
import type { Contact } from '@/lib/supabase/types'
import { formatDistanceToNow } from 'date-fns'

type Tab = 'list' | 'add' | 'import'

export default function ContactsPage() {
  const [tab, setTab] = useState<Tab>('list')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [apifyContact, setApifyContact] = useState<Contact | null>(null)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)



  const loadContacts = useCallback(() => {
    fetch('/api/contacts/import')
      .then((r) => r.json())
      .then((data: { contacts: Contact[]; total: number }) => {
        setContacts(data.contacts ?? [])
        setTotal(data.total ?? 0)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadContacts()
  }, [loadContacts])

  const handleDelete = async (contact: Contact) => {
    if (!confirm(`Delete ${contact.first_name} ${contact.last_name ?? ''}? This will also remove them from all campaigns.`)) return
    setDeletingId(contact.id)
    try {
      await fetch('/api/contacts/import', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contact.id }),
      })
      loadContacts()
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm(`Are you sure you want to delete ALL ${contacts.length} contacts? This will also remove them from all campaigns.`)) return
    setLoading(true)
    try {
      await fetch('/api/contacts/import', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete_all: true }),
      })
      loadContacts()
    } finally {
      setLoading(false)
    }
  }

  const [classifying, setClassifying] = useState(false)
  const [classifyingId, setClassifyingId] = useState<string | null>(null)

  const handleClassifyAll = async () => {
    setClassifying(true)
    try {
      await fetch('/api/ai/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classify_all: true }),
      })
      loadContacts()
    } finally {
      setClassifying(false)
    }
  }

  const handleClassifySingle = async (contactId: string) => {
    setClassifyingId(contactId)
    try {
      await fetch('/api/ai/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      })
      loadContacts()
    } finally {
      setClassifyingId(null)
    }
  }

  const filtered = contacts.filter((c) =>
    !search ||
    c.first_name.toLowerCase().includes(search.toLowerCase()) ||
    c.last_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.toLowerCase().includes(search.toLowerCase()) ||
    c.persona?.toLowerCase().includes(search.toLowerCase()) ||
    c.industry?.toLowerCase().includes(search.toLowerCase())
  )

  // ── Manual add contact form state ──────────────────────────────────────────
  const emptyForm = { first_name: '', last_name: '', email: '', company: '', designation: '' }
  const [form, setForm] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState<Partial<typeof emptyForm>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null)

  const validateForm = () => {
    const errs: Partial<typeof emptyForm> = {}
    if (!form.first_name.trim()) errs.first_name = 'First name is required'
    if (!form.email.trim()) errs.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email address'
    return errs
  }

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validateForm()
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return }
    setFormErrors({})
    setSubmitting(true)
    setSubmitResult(null)
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
            source: 'manual',
          }],
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setSubmitResult({ ok: false, message: data.error || 'Failed to add contact' })
      } else {
        setSubmitResult({ ok: true, message: `${form.first_name} was added successfully!` })
        setForm(emptyForm)
        loadContacts()
        setTimeout(() => { setTab('list'); setSubmitResult(null) }, 1500)
      }
    } catch {
      setSubmitResult({ ok: false, message: 'Network error — please try again' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">{total} total contacts</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {contacts.length > 0 && tab === 'list' && (
            <>
              <button
                id="enrich-all-ai-btn"
                className="btn btn-secondary"
                style={{ color: 'var(--brand-primary)', borderColor: 'rgba(2, 128, 151, 0.35)' }}
                onClick={handleClassifyAll}
                disabled={classifying}
                title="Classify personas, departments, seniority & relevant use cases via AI"
              >
                <Sparkles size={15} /> {classifying ? 'Classifying with AI...' : 'Enrich All with AI'}
              </button>
              <button
                id="delete-all-contacts-btn"
                className="btn btn-secondary"
                style={{ color: 'var(--color-error)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                onClick={handleDeleteAll}
                title="Delete all contacts from database"
              >
                <Trash2 size={15} /> Delete All Contacts
              </button>
            </>
          )}
          <button
            id="tab-list-btn"
            className={`btn ${tab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTab('list'); loadContacts() }}
          >
            <Users size={15} /> Contact List
          </button>
          <button
            id="tab-add-btn"
            className={`btn ${tab === 'add' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTab('add'); setSubmitResult(null); setFormErrors({}) }}
          >
            + Add Contact
          </button>
          <button
            id="tab-import-btn"
            className={`btn ${tab === 'import' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('import')}
          >
            Import CSV
          </button>
        </div>
      </div>

      {tab === 'import' ? (
        <CSVImporter onImportComplete={() => { setTab('list'); loadContacts() }} />
      ) : tab === 'add' ? (
        /* ── Manual Add Contact Form ─────────────────────────────────────── */
        <div className="card" style={{ maxWidth: 540 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Add a Contact Manually</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
            Fill in the details below. The AI will automatically classify their persona after adding.
          </p>

          {submitResult && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              marginBottom: 20,
              fontSize: 13,
              fontWeight: 500,
              background: submitResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: submitResult.ok ? '#16a34a' : 'var(--color-error)',
              border: `1px solid ${submitResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              {submitResult.ok ? '✓ ' : '✗ '}{submitResult.message}
            </div>
          )}

          <form onSubmit={handleAddContact} noValidate>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label className="form-label" htmlFor="add-first-name">
                  First Name <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <input
                  id="add-first-name"
                  className="form-input"
                  placeholder="e.g. Priya"
                  value={form.first_name}
                  onChange={(e) => setForm(f => ({ ...f, first_name: e.target.value }))}
                  style={formErrors.first_name ? { borderColor: 'var(--color-error)' } : {}}
                />
                {formErrors.first_name && (
                  <span style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 4, display: 'block' }}>
                    {formErrors.first_name}
                  </span>
                )}
              </div>
              <div>
                <label className="form-label" htmlFor="add-last-name">Last Name</label>
                <input
                  id="add-last-name"
                  className="form-input"
                  placeholder="e.g. Sharma"
                  value={form.last_name}
                  onChange={(e) => setForm(f => ({ ...f, last_name: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="form-label" htmlFor="add-email">
                Email Address <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <input
                id="add-email"
                type="email"
                className="form-input"
                placeholder="e.g. priya.sharma@company.com"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                style={formErrors.email ? { borderColor: 'var(--color-error)' } : {}}
              />
              {formErrors.email && (
                <span style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 4, display: 'block' }}>
                  {formErrors.email}
                </span>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="form-label" htmlFor="add-company">Company</label>
              <input
                id="add-company"
                className="form-input"
                placeholder="e.g. Infosys, TCS, a Startup..."
                value={form.company}
                onChange={(e) => setForm(f => ({ ...f, company: e.target.value }))}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label className="form-label" htmlFor="add-designation">Designation / Job Title</label>
              <input
                id="add-designation"
                className="form-input"
                placeholder="e.g. VP Engineering, CTO, Head of L&D..."
                value={form.designation}
                onChange={(e) => setForm(f => ({ ...f, designation: e.target.value }))}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                The more specific the title, the better the AI personalization.
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                id="add-contact-submit-btn"
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting
                  ? <><span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Adding...</>
                  : '+ Add Contact'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setForm(emptyForm); setFormErrors({}); setSubmitResult(null) }}
                disabled={submitting}
              >
                Clear
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          {/* Search */}
          <div style={{ marginBottom: 16, position: 'relative', maxWidth: 360 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              id="contact-search"
              className="form-input"
              placeholder="Search name, email, company, persona..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 64, textAlign: 'center' }}>
                <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  {contacts.length === 0 ? 'No contacts yet' : 'No results found'}
                </div>
                <div style={{ fontSize: 13, marginBottom: 20 }}>
                  {contacts.length === 0
                    ? 'Add a contact manually or import from a CSV file'
                    : 'Try a different search'}
                </div>
                {contacts.length === 0 && (
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button className="btn btn-primary" onClick={() => setTab('add')}>
                      + Add Contact
                    </button>
                    <button className="btn btn-secondary" onClick={() => setTab('import')}>
                      Import CSV
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Company</th>
                    <th>Designation</th>
                    <th>AI Persona / Seniority</th>
                    <th>Apify Web Intelligence</th>
                    <th>Added</th>
                    <th style={{ width: 140, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const hasApify = Boolean(c.ai_profile?.apify_enrichment || (c as any).apify_enrichment)
                    return (
                      <tr key={c.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</div>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.email}</span>
                        </td>
                        <td>{c.company || '—'}</td>
                        <td>{c.designation || '—'}</td>
                        <td>
                          {c.persona || c.ai_profile?.persona ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 600, color: 'var(--brand-primary)', fontSize: 12 }}>
                                {c.persona || c.ai_profile?.persona}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {c.seniority || c.ai_profile?.seniority || 'Leader'} • {c.industry || c.ai_profile?.industry || 'Tech'}
                              </span>
                            </div>
                          ) : (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: 11, padding: '2px 6px', color: 'var(--brand-primary)' }}
                              onClick={() => handleClassifySingle(c.id)}
                              disabled={classifyingId === c.id}
                            >
                              {classifyingId === c.id
                                ? <span className="spinner" style={{ width: 10, height: 10 }} />
                                : <><Sparkles size={11} /> Classify</>}
                            </button>
                          )}
                        </td>
                        <td>
                          {hasApify ? (
                            <button
                              onClick={() => setApifyContact(c)}
                              className="btn btn-secondary btn-sm"
                              style={{
                                fontSize: 11,
                                padding: '3px 8px',
                                borderColor: '#f97316',
                                color: '#ea580c',
                                background: 'rgba(249, 115, 22, 0.08)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Search size={11} /> 🔍 Apify Enriched
                            </button>
                          ) : (
                            <button
                              onClick={() => setApifyContact(c)}
                              className="btn btn-secondary btn-sm"
                              style={{
                                fontSize: 11,
                                padding: '3px 8px',
                                color: '#ea580c',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Search size={11} /> Apify Search
                            </button>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{
                                padding: '4px 8px',
                                color: '#2563eb',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11,
                              }}
                              title="Edit Contact details"
                              onClick={() => setEditingContact(c)}
                            >
                              <Pencil size={12} /> Edit
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{
                                padding: '4px 8px',
                                color: '#ea580c',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11,
                              }}
                              title="Search Company & Person LinkedIn via Apify"
                              onClick={() => setApifyContact(c)}
                            >
                              <Search size={12} /> Apify
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{
                                padding: '4px 8px',
                                color: 'var(--color-error)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11,
                              }}
                              title="Delete contact"
                              disabled={deletingId === c.id}
                              onClick={() => handleDelete(c)}
                              id={`delete-contact-${c.id}`}
                            >
                              {deletingId === c.id ? (
                                <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                              ) : (
                                <Trash2 size={12} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {apifyContact && (
        <ApifyEnrichmentModal
          contact={apifyContact}
          isOpen={Boolean(apifyContact)}
          onClose={() => setApifyContact(null)}
          onEnriched={(updated) => {
            setApifyContact(updated)
            loadContacts()
          }}
        />
      )}

      {editingContact && (
        <EditContactModal
          contact={editingContact}
          isOpen={Boolean(editingContact)}
          onClose={() => setEditingContact(null)}
          onSave={() => {
            loadContacts()
          }}
        />
      )}
    </div>
  )
}
