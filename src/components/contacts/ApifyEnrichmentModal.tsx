// src/components/contacts/ApifyEnrichmentModal.tsx
'use client'

import React, { useState } from 'react'
import {
  X,
  Search,
  Building2,
  UserCheck,
  Send,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
} from 'lucide-react'
import type { Contact, ApifyEnrichmentData } from '@/lib/supabase/types'
import { getErrorMessage } from '@/lib/supabase/retry'

interface ApifyEnrichmentModalProps {
  contact: Contact
  isOpen: boolean
  onClose: () => void
  onEnriched?: (updatedContact: Contact) => void
}

export function ApifyEnrichmentModal({
  contact,
  isOpen,
  onClose,
  onEnriched,
}: ApifyEnrichmentModalProps) {
  const [activeTab, setActiveTab] = useState<'intel' | 'email'>('intel')
  const [loading, setLoading] = useState(false)
  const [generatingEmail, setGeneratingEmail] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Current Apify Data
  const apifyData: ApifyEnrichmentData | undefined = contact.ai_profile?.apify_enrichment

  // Email Preview state
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBodyText, setEmailBodyText] = useState('')
  const [emailBodyHtml, setEmailBodyHtml] = useState('')
  const [recipientAnalysis, setRecipientAnalysis] = useState('')
  const [highlights, setHighlights] = useState<string[]>([])

  if (!isOpen) return null

  // Trigger Apify Scraper / Web Search
  const handleRunApifySearch = async () => {
    setLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`/api/contacts/${contact.id}/enrich-apify`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to run Apify search')
      }

      setSuccessMessage('Apify Web & LinkedIn search enrichment completed!')
      if (data.contact && onEnriched) {
        onEnriched(data.contact)
      }
    } catch (err: any) {
      setError(getErrorMessage(err) || 'An error occurred during Apify enrichment')
    } finally {
      setLoading(false)
    }
  }

  // Preview AI Email generated using Apify context
  const handlePreviewApifyEmail = async () => {
    setGeneratingEmail(true)
    setError(null)

    try {
      const res = await fetch(`/api/contacts/${contact.id}/send-apify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: true }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate email preview')
      }

      setEmailSubject(data.subject || '')
      setEmailBodyText(data.body_text || '')
      setEmailBodyHtml(data.body_html || '')
      setRecipientAnalysis(data.recipient_analysis || '')
      setHighlights(data.personalization_highlights || [])
      setActiveTab('email')
    } catch (err: any) {
      setError(getErrorMessage(err) || 'Failed to generate AI email')
    } finally {
      setGeneratingEmail(false)
    }
  }

  // Send Email via SendGrid
  const handleSendEmail = async () => {
    setSendingEmail(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`/api/contacts/${contact.id}/send-apify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: false }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send email via SendGrid')
      }

      setSuccessMessage(`Email successfully dispatched via SendGrid to ${contact.email}!`)
    } catch (err: any) {
      setError(getErrorMessage(err) || 'Failed to send email')
    } finally {
      setSendingEmail(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-tight">
                Apify Web Search Intelligence
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Contact: {contact.first_name} {contact.last_name || ''} ({contact.company || 'N/A'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 dark:border-slate-800 dark:bg-slate-900/50">
          <button
            onClick={() => setActiveTab('intel')}
            className={`flex items-center space-x-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'intel'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Scraped Web & LinkedIn Intel</span>
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`flex items-center space-x-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'email'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Apify-Enhanced Email</span>
          </button>
        </div>

        {/* Notifications / Feedback */}
        {error && (
          <div className="mx-6 mt-4 flex items-center space-x-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="mx-6 mt-4 flex items-center space-x-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'intel' ? (
            <div className="space-y-6">
              {/* Apify Search Banner */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-orange-200 bg-orange-50/50 p-4 dark:border-orange-900/40 dark:bg-orange-950/20">
                <div>
                  <h4 className="text-sm font-medium text-orange-900 dark:text-orange-300">
                    Apify Web Search Engine
                  </h4>
                  <p className="text-xs text-orange-700 dark:text-orange-400 mt-1">
                    Extracts detailed Company About pages & Person LinkedIn profiles to power outreach.
                  </p>
                </div>
                <button
                  onClick={handleRunApifySearch}
                  disabled={loading}
                  className="flex items-center space-x-2 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-orange-500 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Searching Web via Apify...</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      <span>{apifyData ? 'Re-run Apify Search' : 'Search Web & LinkedIn via Apify'}</span>
                    </>
                  )}
                </button>
              </div>

              {apifyData ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 1. Company About Card */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="flex items-center space-x-2 text-slate-900 dark:text-slate-100 font-semibold mb-3 text-sm">
                      <Building2 className="h-4 w-4 text-orange-500" />
                      <span>1. Company About ({contact.company || 'N/A'})</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      {apifyData.company_about || 'No detailed company description extracted.'}
                    </p>
                    {apifyData.company_highlights && apifyData.company_highlights.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Company Highlights</span>
                        <ul className="text-xs space-y-1 text-slate-700 dark:text-slate-300">
                          {apifyData.company_highlights.map((h, i) => (
                            <li key={i} className="flex items-start space-x-1.5">
                              <span className="text-orange-500 font-bold">•</span>
                              <span>{h}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* 2. Person (LinkedIn) About Card */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="flex items-center space-x-2 text-slate-900 dark:text-slate-100 font-semibold mb-3 text-sm">
                      <UserCheck className="h-4 w-4 text-blue-500" />
                      <span>2. Person (LinkedIn) About</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      {apifyData.person_linkedin_about || 'No detailed LinkedIn profile information found.'}
                    </p>
                    {apifyData.person_key_insights && apifyData.person_key_insights.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Professional Insights</span>
                        <ul className="text-xs space-y-1 text-slate-700 dark:text-slate-300">
                          {apifyData.person_key_insights.map((insight, i) => (
                            <li key={i} className="flex items-start space-x-1.5">
                              <span className="text-blue-500 font-bold">•</span>
                              <span>{insight}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Sources Footnote */}
                  {apifyData.sources && apifyData.sources.length > 0 && (
                    <div className="md:col-span-2 rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-xs">
                      <span className="font-semibold text-slate-600 dark:text-slate-400">Scraped Sources: </span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {apifyData.sources.map((src, idx) => (
                          <a
                            key={idx}
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-1 text-blue-600 hover:underline dark:text-blue-400"
                          >
                            <span>{new URL(src).hostname}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <Search className="h-12 w-12 mx-auto mb-3 opacity-40 text-orange-500" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No Apify Web Data Scraped Yet</p>
                  <p className="text-xs mt-1 text-slate-400">Click &quot;Search Web &amp; LinkedIn via Apify&quot; above to extract background details.</p>
                </div>
              )}
            </div>
          ) : (
            /* Email Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Apify AI Email Generator
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Creates tailored outreach emails based on scraped Company & LinkedIn insights.
                  </p>
                </div>
                <button
                  onClick={handlePreviewApifyEmail}
                  disabled={generatingEmail}
                  className="flex items-center space-x-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-50"
                >
                  {generatingEmail ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Generating Preview...</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      <span>Generate AI Email Preview</span>
                    </>
                  )}
                </button>
              </div>

              {emailSubject ? (
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-400">Subject Line</label>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {emailSubject}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-400">Email Body (Plain Text)</label>
                    <div className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 dark:bg-slate-800/60 p-4 text-xs font-mono text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                      {emailBodyText}
                    </div>
                  </div>

                  {recipientAnalysis && (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-800 dark:text-blue-300">
                      <strong className="font-semibold">AI Reasoning & Research Assessment: </strong>
                      {recipientAnalysis}
                    </div>
                  )}

                  {highlights.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-slate-400">Personalization Anchors Applied</label>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {highlights.map((h, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-300"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {emailBodyHtml && (
                    <div>
                      <label className="text-xs font-medium text-slate-400">Email Body (Brand Preview)</label>
                      <div
                        className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-4"
                        dangerouslySetInnerHTML={{ __html: emailBodyHtml }}
                      />
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleSendEmail}
                      disabled={sendingEmail}
                      className="flex items-center space-x-2 rounded-xl bg-orange-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-orange-500 disabled:opacity-50"
                    >
                      {sendingEmail ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Sending via SendGrid...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          <span>Send Email via SendGrid</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <Sparkles className="h-10 w-10 mx-auto mb-2 opacity-40 text-orange-500" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Click &quot;Generate AI Email Preview&quot; to see how Apify data customizes the subject &amp; body.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
