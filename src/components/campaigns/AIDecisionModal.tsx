// src/components/campaigns/AIDecisionModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, Brain, Mail, RefreshCw, Edit3, Eye, Check, Sliders } from 'lucide-react'
import type { Contact } from '@/lib/supabase/types'

interface AIDecisionModalProps {
  campaignId: string
  contact: Contact
  onClose: () => void
  onSent?: () => void
}

interface PreviewData {
  contact: Contact
  decision: {
    action: string
    reason: string
    strategy?: string
    tone?: string
    suggested_angle?: string
    wait_minutes?: number
    confidence?: number
  }
  email_preview?: {
    subject: string
    body_text: string
    body_html: string
    call_to_action: string
    messaging_angle: string
    personalization_highlights: string[]
  } | null
  history_count: number
  events_count: number
}

export function AIDecisionModal({ campaignId, contact, onClose, onSent }: AIDecisionModalProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<PreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Customization & editing state
  const [customInstructions, setCustomInstructions] = useState('')
  const [selectedTone, setSelectedTone] = useState('Technical & Direct')
  const [customSubject, setCustomSubject] = useState('')
  const [customBody, setCustomBody] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleSendNow = async () => {
    if (!confirm(`Send this personalized AI email to ${contact.email} now via SendGrid?`)) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/ai/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          contact_id: contact.id,
          custom_subject: customSubject || data?.email_preview?.subject,
          custom_body: customBody || data?.email_preview?.body_text,
          custom_html: isEditing ? undefined : data?.email_preview?.body_html,
          custom_instructions: customInstructions,
          target_tone: selectedTone,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSendResult({ success: false, message: json.error || 'Failed to send email' })
      } else {
        setSendResult({ success: true, message: json.message || `Email sent successfully to ${contact.email}!` })
        if (onSent) onSent()
      }
    } catch (err: unknown) {
      setSendResult({ success: false, message: err instanceof Error ? err.message : 'Network error' })
    } finally {
      setSending(false)
    }
  }

  const loadPreview = async (overridePrompt?: string, overrideTone?: string) => {
    setLoading(true)
    setError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch('/api/ai/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          contact_id: contact.id,
          custom_instructions: overridePrompt !== undefined ? overridePrompt : customInstructions,
          target_tone: overrideTone !== undefined ? overrideTone : selectedTone,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to load AI decision preview')
      } else {
        setData(json)
        if (json.email_preview) {
          setCustomSubject(json.email_preview.subject)
          setCustomBody(json.email_preview.body_text)
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const fetchPreview = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/ai/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: campaignId,
            contact_id: contact.id,
            custom_instructions: customInstructions,
            target_tone: selectedTone,
          }),
        })
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(json.error || 'Failed to load AI decision preview')
        } else {
          setData(json)
          if (json.email_preview) {
            setCustomSubject(json.email_preview.subject)
            setCustomBody(json.email_preview.body_text)
          }
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPreview()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, contact.id])

  const profile = data?.contact?.ai_profile || contact.ai_profile

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content" style={{ maxWidth: 780, maxHeight: '92vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #028097 0%, #05abc5 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(2, 128, 151, 0.25)'
            }}>
              <Sparkles size={18} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                AI Intelligence & Personalized Studio
              </h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {contact.first_name} {contact.last_name || ''} • <span style={{ color: '#028097', fontWeight: 600 }}>{contact.designation || 'Leader'}</span> at {contact.company || 'Organization'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <span className="spinner" style={{ width: 34, height: 34, borderWidth: 3 }} />
              <div style={{ marginTop: 14, color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>
                Analyzing role parameters, department context & generating tailored AI email...
              </div>
            </div>
          ) : error ? (
            <div className="alert alert-error">
              {error}
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => loadPreview()}
                style={{ marginLeft: 12 }}
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Persona & Domain Classification */}
              <div className="card" style={{ background: 'rgba(2, 128, 151, 0.03)', borderColor: 'rgba(2, 128, 151, 0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Brain size={16} color="#028097" />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Role Classification & Domain Mapping</span>
                  </div>
                  <span style={{
                    background: '#028097', color: '#fff', fontSize: 11, fontWeight: 600,
                    padding: '2px 8px', borderRadius: 6
                  }}>
                    {profile?.role_category || 'Technical / Executive'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, fontSize: 12 }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Persona:</span>{' '}
                    <strong>{profile?.persona || contact.designation || 'Leader'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Seniority:</span>{' '}
                    <strong>{profile?.seniority || 'Executive'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Department:</span>{' '}
                    <strong>{profile?.department || 'Engineering / Tech'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Industry:</span>{' '}
                    <strong>{profile?.industry || 'Technology'}</strong>
                  </div>
                </div>

                {profile?.relevant_use_cases && profile.relevant_use_cases.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Targeted A3CEND Solution Areas:
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {profile.relevant_use_cases.map((uc, i) => (
                        <span
                          key={i}
                          style={{
                            background: 'rgba(2, 128, 151, 0.08)',
                            color: '#028097',
                            border: '1px solid rgba(2, 128, 151, 0.2)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          ✦ {uc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Custom Prompt & Tone Customizer */}
              <div className="card" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Sliders size={15} color="#028097" />
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>Customize AI Prompt & Tone Guidelines</span>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <input
                    className="form-input"
                    placeholder="e.g. Focus on API latency, Python SDK, or enterprise governance..."
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    style={{ flex: 1, fontSize: 12, height: 36 }}
                  />
                  <select
                    className="form-select"
                    value={selectedTone}
                    onChange={(e) => setSelectedTone(e.target.value)}
                    style={{ width: 170, fontSize: 12, height: 36 }}
                  >
                    <option value="Technical & Direct">Technical & Direct</option>
                    <option value="Executive Peer-to-Peer">Executive Peer-to-Peer</option>
                    <option value="Consultative & Thoughtful">Consultative & Thoughtful</option>
                    <option value="Brief & High-Impact">Brief & High-Impact</option>
                  </select>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => loadPreview(customInstructions, selectedTone)}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    <Sparkles size={12} /> Regenerate
                  </button>
                </div>
              </div>

              {/* AI Decision Strategy Card */}
              {data?.decision && (
                <div className="card" style={{ borderLeft: '4px solid #028097' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>AI Action:</span>
                      <span
                        style={{
                          background: '#028097',
                          color: '#ffffff',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {data.decision.action}
                      </span>
                    </div>
                    {data.decision.confidence && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Confidence: {(data.decision.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, lineHeight: 1.5, color: '#334155', marginBottom: 4 }}>
                    <strong>Why:</strong> {data.decision.reason}
                  </div>
                  {data.decision.suggested_angle && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      <strong>Angle:</strong> {data.decision.suggested_angle}
                    </div>
                  )}
                </div>
              )}

              {/* Generated Email Preview */}
              {data?.email_preview && (
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Mail size={16} color="#028097" />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>Generated Email & Brand Preview</span>
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setIsEditing(!isEditing)}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                    >
                      {isEditing ? <><Eye size={12} /> View Rendered HTML</> : <><Edit3 size={12} /> Edit Copy</>}
                    </button>
                  </div>

                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 11, marginBottom: 3 }}>Subject Line</label>
                        <input
                          className="form-input"
                          value={customSubject}
                          onChange={(e) => setCustomSubject(e.target.value)}
                          style={{ fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 11, marginBottom: 3 }}>Body (Plain Text)</label>
                        <textarea
                          className="form-input"
                          rows={6}
                          value={customBody}
                          onChange={(e) => setCustomBody(e.target.value)}
                          style={{ fontSize: 13, fontFamily: 'sans-serif' }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setSaveSuccess(true)
                            setTimeout(() => setSaveSuccess(false), 2000)
                          }}
                        >
                          {saveSuccess ? <><Check size={12} /> Saved!</> : 'Apply Edits'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 16 }}>
                      <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 8, marginBottom: 12, fontSize: 13 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Subject:</span>{' '}
                        <strong>{customSubject || data.email_preview.subject}</strong>
                      </div>

                      <div
                        style={{ fontSize: 13, lineHeight: 1.6, color: '#1e293b' }}
                        dangerouslySetInnerHTML={{ __html: data.email_preview.body_html }}
                      />

                      {data.email_preview.personalization_highlights && data.email_preview.personalization_highlights.length > 0 && (
                        <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed #e2e8f0' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                            Personalization Anchors Applied:
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {data.email_preview.personalization_highlights.map((h, i) => (
                              <span
                                key={i}
                                style={{
                                  background: '#f1f5f9',
                                  color: '#475569',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontSize: 10,
                                }}
                              >
                                ✓ {h}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Send feedback alert banner */}
              {sendResult && (
                <div
                  className={`alert ${sendResult.success ? 'alert-success' : 'alert-error'}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                >
                  {sendResult.success ? <Check size={16} /> : <X size={16} />}
                  <span>{sendResult.message}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={() => loadPreview()} disabled={loading || sending}>
            <RefreshCw size={13} /> Re-evaluate AI
          </button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={sending}>
              Close
            </button>
            {data?.email_preview && (
              <button
                className="btn btn-primary"
                onClick={handleSendNow}
                disabled={sending || loading}
                style={{
                  background: 'linear-gradient(135deg, #028097 0%, #05abc5 100%)',
                  boxShadow: '0 2px 10px rgba(2, 128, 151, 0.35)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {sending ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14 }} /> Sending via SendGrid...
                  </>
                ) : (
                  <>
                    <Mail size={14} /> Send This AI Email via SendGrid
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
