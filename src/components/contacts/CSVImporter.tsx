'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import { Upload, CheckCircle, XCircle, AlertCircle, FileText } from 'lucide-react'

interface CSVRow {
  index: number
  first_name: string
  last_name: string
  email: string
  company: string
  designation: string
  valid: boolean
  error?: string
  isDuplicate?: boolean
}

interface ImportResult {
  imported: number
  enrolled?: number
  skipped: number
  errors: Array<{ email: string; reason: string }>
  message: string
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function parseCSVRow(row: Record<string, string>, index: number): CSVRow {
  const firstName =
    row['Name'] ?? row['First Name'] ?? row['first_name'] ?? row['FirstName'] ?? ''
  const lastName =
    row['Last Name'] ?? row['LastName'] ?? row['last_name'] ?? row['Surname'] ?? ''
  const email =
    (row['Email'] ?? row['email'] ?? row['Email Address'] ?? '').toLowerCase().trim()
  const company =
    row['Company'] ?? row['company'] ?? row['Organization'] ?? ''
  const designation =
    row['Designation'] ?? row['designation'] ?? row['Title'] ?? row['Job Title'] ?? ''

  let valid = true
  let error: string | undefined

  if (!email) {
    valid = false
    error = 'Missing email'
  } else if (!validateEmail(email)) {
    valid = false
    error = 'Invalid email format'
  } else if (!firstName.trim()) {
    valid = false
    error = 'Missing name'
  }

  return {
    index,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    email,
    company: company.trim(),
    designation: designation.trim(),
    valid,
    error,
  }
}

interface CSVImporterProps {
  campaignId?: string
  campaignName?: string
  onImportComplete?: (count: number) => void
  onClose?: () => void
}

export function CSVImporter({ campaignId, campaignName, onImportComplete, onClose }: CSVImporterProps) {
  const [rows, setRows] = useState<CSVRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [error, setError] = useState<string>('')

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setFileName(file.name)
    setResult(null)
    setError('')

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rawRows = results.data as Record<string, string>[]
        const seen = new Set<string>()
        const parsed = rawRows.map((row, i) => {
          const r = parseCSVRow(row, i)
          if (r.valid && seen.has(r.email)) {
            r.isDuplicate = true
            r.valid = false
            r.error = 'Duplicate email in file'
          } else if (r.valid) {
            seen.add(r.email)
          }
          return r
        })
        setRows(parsed)
        // Pre-select all valid rows
        const validIds = new Set(parsed.filter((r) => r.valid).map((r) => r.index))
        setSelectedIds(validIds)
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`)
      },
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.csv'] },
    maxFiles: 1,
  })

  const validRows = rows.filter((r) => r.valid)
  const invalidRows = rows.filter((r) => !r.valid)
  const selectedRows = validRows.filter((r) => selectedIds.has(r.index))

  const toggleAll = () => {
    if (selectedIds.size === validRows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(validRows.map((r) => r.index)))
    }
  }

  const toggle = (index: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const handleImport = async () => {
    if (selectedRows.length === 0) return
    setImporting(true)
    setError('')

    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          contacts: selectedRows.map((r) => ({
            first_name: r.first_name,
            last_name: r.last_name,
            email: r.email,
            company: r.company,
            designation: r.designation,
          })),
        }),
      })

      const data = await res.json() as ImportResult & { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Import failed')
      } else {
        setResult(data)
        onImportComplete?.(data.enrolled ?? data.imported)
      }
    } catch {
      setError('Network error during import')
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setRows([])
    setSelectedIds(new Set())
    setResult(null)
    setError('')
    setFileName('')
  }

  if (result) {
    return (
      <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <CheckCircle size={48} color="var(--color-success)" style={{ marginBottom: 16, display: 'block', margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            {campaignId ? 'Import & Enrollment Complete' : 'Import Complete'}
          </h3>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>{result.message}</div>

          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
            {campaignId ? (
              <>
                <div className="stat-card" style={{ '--accent-color': 'var(--brand-primary)' } as React.CSSProperties}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--brand-primary)' }}>{result.enrolled ?? 0}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Enrolled in Campaign</div>
                </div>
                <div className="stat-card" style={{ '--accent-color': 'var(--color-success)' } as React.CSSProperties}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-success)' }}>{result.imported}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Contacts Saved</div>
                </div>
                <div className="stat-card" style={{ '--accent-color': 'var(--color-error)' } as React.CSSProperties}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-error)' }}>{result.errors?.length ?? 0}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Errors</div>
                </div>
              </>
            ) : (
              <>
                <div className="stat-card" style={{ '--accent-color': 'var(--color-success)' } as React.CSSProperties}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-success)' }}>{result.imported}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Imported</div>
                </div>
                <div className="stat-card" style={{ '--accent-color': 'var(--color-warning)' } as React.CSSProperties}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-warning)' }}>{result.skipped}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Skipped (Dups)</div>
                </div>
                <div className="stat-card" style={{ '--accent-color': 'var(--color-error)' } as React.CSSProperties}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-error)' }}>{result.errors?.length ?? 0}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Errors</div>
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={reset}>Import Another File</button>
            {onClose ? (
              <button className="btn btn-primary" onClick={onClose}>Done & Back to Campaign</button>
            ) : (
              <a href="/contacts" className="btn btn-primary">View Contacts</a>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Drop zone */}
      {rows.length === 0 && (
        <div {...getRootProps()} className={`drop-zone ${isDragActive ? 'active' : ''}`}>
          <input {...getInputProps()} id="csv-file-input" />
          <Upload size={40} color="var(--text-muted)" style={{ marginBottom: 16, display: 'block', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
            {isDragActive ? 'Drop CSV file here' : 'Drag & drop a CSV file'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            or click to browse
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Expected columns: Name, Last Name, Email, Company, Designation
          </div>
        </div>
      )}

      {/* File loaded */}
      {rows.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <FileText size={18} color="var(--brand-primary)" />
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fileName}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {rows.length} rows detected
            </span>
            <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ color: 'var(--color-success)' }}>✓ {validRows.length} valid</span>
              {invalidRows.length > 0 && (
                <span style={{ color: 'var(--color-error)' }}>✗ {invalidRows.length} invalid</span>
              )}
              <span style={{ color: 'var(--brand-primary)' }}>{selectedIds.size} selected</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={reset}>Clear</button>
          </div>

          {error && (
            <div className="alert alert-error">
              <XCircle size={16} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* Preview table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Preview</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  id="select-all-contacts"
                  checked={selectedIds.size === validRows.length && validRows.length > 0}
                  onChange={toggleAll}
                />
                <label htmlFor="select-all-contacts">Select all valid</label>
              </div>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Company</th>
                    <th>Designation</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.index} style={{ opacity: row.valid ? 1 : 0.5 }}>
                      <td>
                        {row.valid && (
                          <input
                            type="checkbox"
                            id={`contact-row-${row.index}`}
                            checked={selectedIds.has(row.index)}
                            onChange={() => toggle(row.index)}
                          />
                        )}
                      </td>
                      <td>
                        {row.first_name} {row.last_name}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.email}</td>
                      <td>{row.company || '—'}</td>
                      <td>{row.designation || '—'}</td>
                      <td>
                        {row.valid ? (
                          <span style={{ color: 'var(--color-success)', fontSize: 12 }}>✓ Valid</span>
                        ) : (
                          <span style={{ color: 'var(--color-error)', fontSize: 12 }}>
                            <AlertCircle size={12} style={{ display: 'inline', marginRight: 4 }} />
                            {row.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import button */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              id="import-contacts-btn"
              className="btn btn-primary"
              disabled={selectedRows.length === 0 || importing}
              onClick={handleImport}
            >
              {importing ? (
                <><span className="spinner" />&nbsp;Enrolling...</>
              ) : campaignId ? (
                <>Enroll {selectedRows.length} Contact{selectedRows.length !== 1 ? 's' : ''} into Campaign</>
              ) : (
                <>Import {selectedRows.length} Contact{selectedRows.length !== 1 ? 's' : ''}</>
              )}
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {campaignId
                ? 'Contacts will be queued for this campaign. No emails are sent until you start.'
                : 'No emails will be sent during import'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
