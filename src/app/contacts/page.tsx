'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Search } from 'lucide-react'
import { CSVImporter } from '@/components/contacts/CSVImporter'
import type { Contact } from '@/lib/supabase/types'
import { formatDistanceToNow } from 'date-fns'

export default function ContactsPage() {
  const [tab, setTab] = useState<'list' | 'import'>('list')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

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

  const filtered = contacts.filter((c) =>
    !search ||
    c.first_name.toLowerCase().includes(search.toLowerCase()) ||
    c.last_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">{total} total contacts</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            id="tab-list-btn"
            className={`btn ${tab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTab('list'); loadContacts() }}
          >
            <Users size={15} /> Contact List
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
      ) : (
        <>
          {/* Search */}
          <div style={{ marginBottom: 16, position: 'relative', maxWidth: 360 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              id="contact-search"
              className="form-input"
              placeholder="Search contacts..."
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
                    ? 'Import your contacts via CSV to get started'
                    : 'Try a different search'}
                </div>
                {contacts.length === 0 && (
                  <button className="btn btn-primary" onClick={() => setTab('import')}>
                    Import CSV
                  </button>
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
                    <th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</div>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.email}</span>
                      </td>
                      <td>{c.company || '—'}</td>
                      <td>{c.designation || '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
