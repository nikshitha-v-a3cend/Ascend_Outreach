// src/lib/ai/orchestration.ts
// Shared AI-driven send/decision logic used by BOTH the campaign start
// endpoint (initial enrollment) and the cron follow-up processor.
//
// Centralizing this in one place means there is exactly one implementation
// of "classify → decide → generate → send → record" to keep correct, and
// it's the reason the enrollment sweep in the cron route doesn't have to
// re-implement the campaign-start logic.
//
// Every function here calls into src/lib/ai/service.ts (which talks to
// OpenAI) wrapped in try/catch — if AI classification/decision/generation
// fails for any reason (missing key, rate limit, bad JSON), the caller
// always has a safe fallback (a configured SendGrid template, or skipping
// the contact with a logged reason). AI failure never crashes a request.

import { sendEmail, buildOutreachReplyTo } from '@/lib/sendgrid/client'
import { classifyContact, decideNextAction, generatePersonalizedEmail } from '@/lib/ai/service'
import { enrichContactWithApify } from '@/lib/apify/enrichment'
import { safeAiProfile, mergeAiProfile } from '@/lib/ai/profile'
import { withSupabaseRetry } from '@/lib/supabase/retry'
import { resolveMaxSteps, MIN_WAIT_MINUTES } from '@/lib/ai/safety'
import type { Contact, TemplateType } from '@/lib/supabase/types'

type DB = ReturnType<typeof import('@/lib/supabase/server').getServerSupabase>

export interface CampaignLite {
  id: string
  name: string
  from_name: string
  from_email: string
  from_title?: string | null
  initial_template_id?: string | null
  no_open_template_id?: string | null
  opened_no_reply_template_id?: string | null
  follow_up_delay_minutes: number
  max_follow_ups?: number | null
  custom_instructions?: string | null
  messaging_guidelines?: string | null
  target_tone?: string | null
}

export interface CampaignContactLite {
  id: string
  campaign_id: string
  contact_id: string
  current_step: number
  opened: boolean
  replied: boolean
  bounced: boolean
  unsubscribed: boolean
  stopped: boolean
  status?: string
  follow_up_due_at?: string | null
}

/**
 * Ensures a contact has Apify Web & LinkedIn research + AI profile.
 * Automatically runs Apify Google search for Company About + Person LinkedIn profile.
 */
export async function classifyIfNeeded(db: DB, contact: Contact): Promise<Contact> {
  // ai_profile can come back as a JSON-encoded string rather than a parsed
  // object (e.g. if the column round-trips as text) — normalize it up
  // front so the presence checks below actually see cached data instead of
  // always concluding nothing has run yet and redoing the work every time.
  let updatedContact: Contact = { ...contact, ai_profile: safeAiProfile(contact.ai_profile) as any }

  // 1. Ensure Apify Web Research (Company About + Person LinkedIn About) is present
  if (!updatedContact.ai_profile?.apify_enrichment) {
    try {
      const apifyRes = await enrichContactWithApify(updatedContact.id)
      if (apifyRes.contact) {
        updatedContact = { ...apifyRes.contact, ai_profile: safeAiProfile(apifyRes.contact.ai_profile) as any }
      }
    } catch (apifyErr) {
      console.warn('[AI Orchestration] Apify web research warning, proceeding:', apifyErr)
    }
  }

  // 2. Ensure AI Classification is present
  if (updatedContact.ai_profile?.persona) return updatedContact

  try {
    const classification = await classifyContact({
      first_name: updatedContact.first_name,
      last_name: updatedContact.last_name,
      email: updatedContact.email,
      company: updatedContact.company,
      designation: updatedContact.designation,
      department: updatedContact.department,
    })

    const now = new Date().toISOString()
    const mergedAiProfile = mergeAiProfile(updatedContact.ai_profile, classification)

    // Retried — a transient network blip here shouldn't lose the
    // classification result; without a successful write, the next call
    // for this contact would just redo the work.
    const { error: writeError } = await withSupabaseRetry(() =>
      db
        .from('contacts')
        .update({
          department: classification.department,
          industry: classification.industry,
          persona: classification.persona,
          seniority: classification.seniority,
          role_category: classification.role_category,
          company_category: classification.company_category,
          relevant_use_cases: classification.relevant_use_cases as any,
          ai_profile: mergedAiProfile as any,
          ai_profile_updated_at: now,
        })
        .eq('id', updatedContact.id)
    )
    if (writeError) {
      console.warn('[AI Orchestration] Failed to persist classification (will redo next time):', writeError)
    }

    return { ...updatedContact, ...classification, ai_profile: mergedAiProfile as any, ai_profile_updated_at: now }
  } catch (err) {
    console.warn('[AI Orchestration] Classification failed, continuing with contact data:', err)
    return updatedContact
  }
}

/**
 * Sends the first email in the sequence to a "queued" contact. Runs the
 * full classify → decide → generate pipeline, falling back to the
 * campaign's configured initial_template_id if AI generation fails for any
 * reason. If neither AI content nor a template is available, the contact
 * is skipped (not sent) and logged — never sent empty/garbage content.
 */
export async function runInitialSend(
  db: DB,
  campaign: CampaignLite,
  contact: Contact,
  ccId: string
): Promise<{ sent: boolean; skipped?: boolean; reason?: string }> {
  const contactProfile = await classifyIfNeeded(db, contact)

  let decisionId: string | null = null
  let personalizedEmail: { subject: string; body_text: string; body_html: string } | null = null

  try {
    const decision = await decideNextAction({
      contact: contactProfile,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        from_name: campaign.from_name,
        from_email: campaign.from_email,
        messaging_guidelines: campaign.messaging_guidelines || undefined,
      },
      campaign_contact: {
        id: ccId,
        status: 'queued',
        current_step: 0,
        opened: false,
        replied: false,
        bounced: false,
      },
      email_history: [],
      events: [],
      replies: [],
      previous_decisions: [],
    })

    const { data: decRecord } = await db
      .from('ai_decisions')
      .insert({
        contact_id: contact.id,
        campaign_id: campaign.id,
        action: decision.action || 'SEND_FIRST_EMAIL',
        reason: decision.reason || 'Initial AI-generated outreach',
        strategy: decision.strategy || 'Executive introduction tailored to role and pain points',
        tone: decision.tone || 'Consultative & Professional',
        suggested_angle: decision.suggested_angle,
        wait_minutes: decision.wait_minutes || 0,
        context: { campaign_name: campaign.name, step: 1 },
      })
      .select('id')
      .single()

    decisionId = decRecord?.id ?? null

    personalizedEmail = await generatePersonalizedEmail({
      contact: contactProfile,
      campaign: {
        name: campaign.name,
        from_name: campaign.from_name,
        from_email: campaign.from_email,
        from_title: campaign.from_title,
      },
      step: 1,
      decision,
      custom_instructions: campaign.custom_instructions || undefined,
      messaging_guidelines: campaign.messaging_guidelines || undefined,
      target_tone: campaign.target_tone || undefined,
      previous_emails: [],
      interaction_summary: { opened_count: 0, replied: false },
    })
  } catch (aiErr) {
    console.warn('[AI Orchestration] AI generation failed for initial send, falling back to template:', aiErr)
  }

  if (!personalizedEmail && !campaign.initial_template_id) {
    await db.from('campaign_contacts').update({ status: 'failed', stopped: true }).eq('id', ccId)
    await db.from('campaign_logs').insert({
      campaign_id: campaign.id,
      contact_id: contact.id,
      level: 'error',
      message: 'Initial send skipped: AI generation failed and no fallback template configured',
    })
    return { sent: false, skipped: true, reason: 'no_content' }
  }

  const { data: msgRecord } = await db
    .from('email_messages')
    .insert({
      campaign_id: campaign.id,
      contact_id: contact.id,
      campaign_contact_id: ccId,
      step: 1,
      template_type: personalizedEmail ? 'ai_personalized' : 'initial_outreach',
      subject: personalizedEmail?.subject || null,
      body_text: personalizedEmail?.body_text || null,
      body_html: personalizedEmail?.body_html || null,
      decision_id: decisionId,
      personalization_context: personalizedEmail ? { ai_generated: true } : null,
      status: 'pending',
    })
    .select()
    .single()

  const sendResult = personalizedEmail
    ? await sendEmail({
        to: contact.email,
        fromEmail: campaign.from_email,
        fromName: campaign.from_name,
        replyTo: buildOutreachReplyTo(campaign.from_email),
        subject: personalizedEmail.subject,
        html: personalizedEmail.body_html,
        text: personalizedEmail.body_text,
        customArgs: { campaign_id: campaign.id, contact_id: contact.id, campaign_contact_id: ccId, sequence_step: '1' },
      })
    : await sendEmail({
        to: contact.email,
        fromEmail: campaign.from_email,
        fromName: campaign.from_name,
        replyTo: buildOutreachReplyTo(campaign.from_email),
        templateId: campaign.initial_template_id!,
        dynamicTemplateData: {
          firstName: contact.first_name,
          lastName: contact.last_name ?? '',
          email: contact.email,
          company: contact.company ?? '',
          designation: contact.designation ?? '',
        },
        customArgs: { campaign_id: campaign.id, contact_id: contact.id, campaign_contact_id: ccId, sequence_step: '1' },
      })

  const now = new Date()

  if (sendResult.success) {
    const followUpDue = new Date(now.getTime() + campaign.follow_up_delay_minutes * 60 * 1000)

    if (msgRecord) {
      await db
        .from('email_messages')
        .update({ status: 'sent', sendgrid_message_id: sendResult.messageId ?? null, sent_at: now.toISOString() })
        .eq('id', msgRecord.id)
    }

    await db
      .from('campaign_contacts')
      .update({
        status: 'sent',
        current_step: 1,
        email_1_sent_at: now.toISOString(),
        follow_up_due_at: followUpDue.toISOString(),
      })
      .eq('id', ccId)

    await db.from('campaign_logs').insert({
      campaign_id: campaign.id,
      contact_id: contact.id,
      level: 'info',
      message: personalizedEmail
        ? `AI Personalized Email #1 sent: "${personalizedEmail.subject}"`
        : 'Email #1 sent successfully',
      metadata: {
        template_type: personalizedEmail ? 'ai_personalized' : 'initial_outreach',
        message_id: sendResult.messageId,
        subject: personalizedEmail?.subject,
        decision_id: decisionId,
        follow_up_due_at: followUpDue.toISOString(),
      },
    })

    return { sent: true }
  }

  if (msgRecord) await db.from('email_messages').update({ status: 'failed' }).eq('id', msgRecord.id)
  await db.from('campaign_contacts').update({ status: 'failed', stopped: true }).eq('id', ccId)
  await db.from('campaign_logs').insert({
    campaign_id: campaign.id,
    contact_id: contact.id,
    level: 'error',
    message: `Email #1 failed: ${sendResult.error}`,
    metadata: { error: sendResult.error, status_code: sendResult.statusCode },
  })

  return { sent: false, reason: sendResult.error }
}

/**
 * Runs the AI decision engine for one contact whose follow-up is due, and
 * acts on whatever it returns — not just a fixed two-template branch.
 * Handles every action the model can return:
 *  - STOP / HAND_TO_HUMAN: end automated outreach for this contact.
 *  - WAIT: reschedule without sending (floored at MIN_WAIT_MINUTES).
 *  - anything else (SEND_FOLLOWUP, CHANGE_SUBJECT, CHANGE_MESSAGING_ANGLE,
 *    SEND_RELEVANT_CONTENT, ASK_A_QUESTION, or any future action the model
 *    invents): generate a personalized email for this step and send it.
 * The campaign's own configured follow-up count (campaign.max_follow_ups,
 * null = unlimited) is enforced here regardless of what the AI says, always
 * bounded by the absolute backend safety ceiling — the backend, not the
 * model (and not even the campaign's own config), owns "never contact
 * indefinitely."
 *
 * `cc` must reflect the row's state from BEFORE it was claimed (status
 * flipped to 'follow_up_sending') so this function can correctly restore
 * the prior status if it ends up skipping or failing.
 */
export async function runFollowUpAction(
  db: DB,
  campaign: CampaignLite,
  cc: CampaignContactLite,
  contact: Contact
): Promise<{ outcome: 'sent' | 'stopped' | 'handed_to_human' | 'waiting' | 'skipped' | 'failed' }> {
  const priorStatus = cc.status === 'manual_reply_sent' ? 'manual_reply_sent' : cc.current_step <= 1 ? 'sent' : 'follow_up_sent'
  const contactProfile = await classifyIfNeeded(db, contact)

  const { data: prevMessages } = await db
    .from('email_messages')
    .select('*')
    .eq('campaign_id', cc.campaign_id)
    .eq('contact_id', cc.contact_id)
    .order('step', { ascending: true })

  const { data: events } = await db
    .from('email_events')
    .select('event_type, event_timestamp')
    .eq('campaign_id', cc.campaign_id)
    .eq('contact_id', cc.contact_id)

  const { data: replies } = await db
    .from('replies')
    .select('from_email, subject, body_text, received_at')
    .eq('contact_id', cc.contact_id)

  const { data: prevDecisions } = await db
    .from('ai_decisions')
    .select('*')
    .eq('contact_id', cc.contact_id)
    .order('created_at', { ascending: false })

  let decision: {
    action: string
    reason: string
    strategy?: string
    tone?: string
    suggested_angle?: string
    wait_minutes?: number
  } = {
    action: cc.status === 'manual_reply_sent'
      ? 'REENGAGE_THREAD'
      : cc.opened
      ? 'SEND_FOLLOWUP'
      : 'CHANGE_SUBJECT',
    reason: cc.status === 'manual_reply_sent'
      ? 'Prospect went quiet after our team sent a manual reply. Re-engaging thread.'
      : cc.opened
      ? 'Contact opened previous email without replying'
      : 'Contact did not open previous email',
    strategy: cc.status === 'manual_reply_sent'
      ? 'Contextual conversational check-in on the active thread'
      : 'Follow-up bump tailored to engagement',
  }

  try {
    decision = await decideNextAction({
      contact: contactProfile,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        from_name: campaign.from_name,
        from_email: campaign.from_email,
        messaging_guidelines: campaign.messaging_guidelines || undefined,
      },
      campaign_contact: {
        id: cc.id,
        status: priorStatus,
        current_step: cc.current_step,
        opened: cc.opened,
        replied: cc.replied,
        bounced: cc.bounced,
      },
      email_history: (prevMessages || []).map((m) => ({
        step: m.step,
        subject: m.subject,
        body_text: m.body_text,
        sent_at: m.sent_at,
        template_type: m.template_type,
      })),
      events: events || [],
      replies: replies || [],
      previous_decisions: (prevDecisions || []).map((d) => ({
        action: d.action,
        reason: d.reason,
        strategy: d.strategy,
        created_at: d.created_at,
      })),
    })
  } catch (decErr) {
    console.warn('[AI Orchestration] AI decision failed, using heuristic fallback:', decErr)
  }

  const { data: decRecord } = await db
    .from('ai_decisions')
    .insert({
      contact_id: cc.contact_id,
      campaign_id: cc.campaign_id,
      action: decision.action,
      reason: decision.reason,
      strategy: decision.strategy,
      tone: decision.tone,
      suggested_angle: decision.suggested_angle,
      wait_minutes: decision.wait_minutes || 0,
      context: { opened: cc.opened, previous_steps: prevMessages?.length || 0, current_step: cc.current_step },
    })
    .select('id')
    .single()

  const decisionId = decRecord?.id ?? null
  const nextStep = cc.current_step + 1

  if (decision.action === 'STOP') {
    await db.from('campaign_contacts').update({ stopped: true, status: 'stopped' }).eq('id', cc.id)
    await db.from('campaign_logs').insert({
      campaign_id: cc.campaign_id,
      contact_id: cc.contact_id,
      level: 'info',
      message: `AI stopped further outreach: ${decision.reason}`,
      metadata: { decision_id: decisionId },
    })
    return { outcome: 'stopped' }
  }

  if (decision.action === 'HAND_TO_HUMAN') {
    await db.from('campaign_contacts').update({ stopped: true, status: 'replied' }).eq('id', cc.id)
    await db.from('campaign_logs').insert({
      campaign_id: cc.campaign_id,
      contact_id: cc.contact_id,
      level: 'info',
      message: `AI handed contact to human operator: ${decision.reason}`,
      metadata: { decision_id: decisionId },
    })
    return { outcome: 'handed_to_human' }
  }

  // Hard safety cap — never contact indefinitely, no matter what the AI
  // says or what the campaign is configured to do.
  const maxSteps = resolveMaxSteps(campaign.max_follow_ups)
  if (nextStep > maxSteps) {
    await db.from('campaign_contacts').update({ stopped: true, status: 'stopped' }).eq('id', cc.id)
    await db.from('campaign_logs').insert({
      campaign_id: cc.campaign_id,
      contact_id: cc.contact_id,
      level: 'info',
      message: `Sequence cap (${maxSteps} emails) reached — stopping outreach regardless of AI suggestion (${decision.action})`,
      metadata: { decision_id: decisionId, ai_action: decision.action },
    })
    return { outcome: 'stopped' }
  }

  if (decision.action === 'WAIT') {
    const waitMinutes = Math.max(decision.wait_minutes || 60, MIN_WAIT_MINUTES)
    const nextDue = new Date(Date.now() + waitMinutes * 60 * 1000).toISOString()
    await db.from('campaign_contacts').update({ status: priorStatus, follow_up_due_at: nextDue }).eq('id', cc.id)
    await db.from('campaign_logs').insert({
      campaign_id: cc.campaign_id,
      contact_id: cc.contact_id,
      level: 'info',
      message: `AI deferred next action by ${waitMinutes}m: ${decision.reason}`,
      metadata: { decision_id: decisionId, next_due_at: nextDue },
    })
    return { outcome: 'waiting' }
  }

  // Any other action — SEND_FOLLOWUP, CHANGE_SUBJECT, CHANGE_MESSAGING_ANGLE,
  // SEND_RELEVANT_CONTENT, ASK_A_QUESTION, or anything the model invents —
  // is treated as "generate and send a personalized email for this step."
  let personalizedEmail: { subject: string; body_text: string; body_html: string } | null = null
  try {
    personalizedEmail = await generatePersonalizedEmail({
      contact: contactProfile,
      campaign: {
        name: campaign.name,
        from_name: campaign.from_name,
        from_email: campaign.from_email,
        from_title: campaign.from_title,
      },
      step: nextStep,
      decision,
      custom_instructions: campaign.custom_instructions || undefined,
      messaging_guidelines: campaign.messaging_guidelines || undefined,
      target_tone: campaign.target_tone || undefined,
      previous_emails: (prevMessages || []).map((m) => ({ step: m.step, subject: m.subject, body_text: m.body_text })),
      replies_history: (replies || []).map((r) => ({
        from_email: r.from_email,
        subject: r.subject,
        body_text: r.body_text,
        received_at: r.received_at,
      })),
      interaction_summary: {
        opened_count: (events || []).filter((e) => e.event_type === 'open').length || (cc.opened ? 1 : 0),
        last_opened_at: cc.follow_up_due_at,
        replied: false,
      },
    })
  } catch (genErr) {
    console.warn('[AI Orchestration] AI email generation failed, falling back to template:', genErr)
  }

  const templateType: TemplateType = cc.opened ? 'opened_no_reply' : 'no_open'
  const fallbackTemplateId = cc.opened ? campaign.opened_no_reply_template_id : campaign.no_open_template_id

  if (!personalizedEmail && !fallbackTemplateId) {
    await db.from('campaign_contacts').update({ status: priorStatus }).eq('id', cc.id)
    await db.from('campaign_logs').insert({
      campaign_id: cc.campaign_id,
      contact_id: cc.contact_id,
      level: 'warn',
      message: 'Follow-up skipped: no AI copy and no fallback template configured',
    })
    return { outcome: 'skipped' }
  }

  const { data: msgRecord } = await db
    .from('email_messages')
    .insert({
      campaign_id: cc.campaign_id,
      contact_id: cc.contact_id,
      campaign_contact_id: cc.id,
      step: nextStep,
      template_type: personalizedEmail ? 'ai_personalized' : templateType,
      subject: personalizedEmail?.subject || null,
      body_text: personalizedEmail?.body_text || null,
      body_html: personalizedEmail?.body_html || null,
      decision_id: decisionId,
      personalization_context: personalizedEmail ? { action: decision.action, reason: decision.reason } : null,
      status: 'pending',
    })
    .select()
    .single()

  const sendResult = personalizedEmail
    ? await sendEmail({
        to: contact.email,
        fromEmail: campaign.from_email,
        fromName: campaign.from_name,
        replyTo: buildOutreachReplyTo(campaign.from_email),
        subject: personalizedEmail.subject,
        html: personalizedEmail.body_html,
        text: personalizedEmail.body_text,
        customArgs: { campaign_id: cc.campaign_id, contact_id: cc.contact_id, campaign_contact_id: cc.id, sequence_step: String(nextStep) },
      })
    : await sendEmail({
        to: contact.email,
        fromEmail: campaign.from_email,
        fromName: campaign.from_name,
        replyTo: buildOutreachReplyTo(campaign.from_email),
        templateId: fallbackTemplateId!,
        dynamicTemplateData: {
          firstName: contact.first_name,
          lastName: contact.last_name ?? '',
          email: contact.email,
          company: contact.company ?? '',
          designation: contact.designation ?? '',
        },
        customArgs: { campaign_id: cc.campaign_id, contact_id: cc.contact_id, campaign_contact_id: cc.id, sequence_step: String(nextStep) },
      })

  const sentAt = new Date().toISOString()

  if (sendResult.success) {
    if (msgRecord) {
      await db
        .from('email_messages')
        .update({ status: 'sent', sendgrid_message_id: sendResult.messageId ?? null, sent_at: sentAt })
        .eq('id', msgRecord.id)
    }

    const waitMinutes = Math.max(decision.wait_minutes || campaign.follow_up_delay_minutes, MIN_WAIT_MINUTES)
    const reachedCap = nextStep >= maxSteps
    const nextDue = reachedCap ? null : new Date(Date.now() + waitMinutes * 60 * 1000).toISOString()

    await db
      .from('campaign_contacts')
      .update({
        current_step: nextStep,
        follow_up_sent_at: sentAt,
        status: reachedCap ? 'stopped' : 'follow_up_sent',
        stopped: reachedCap,
        follow_up_due_at: nextDue,
      })
      .eq('id', cc.id)

    await db.from('campaign_logs').insert({
      campaign_id: cc.campaign_id,
      contact_id: cc.contact_id,
      level: 'info',
      message: personalizedEmail
        ? `AI Follow-up Sent: "${personalizedEmail.subject}" (${decision.action})`
        : `Follow-up sent (${templateType})`,
      metadata: {
        action: decision.action,
        decision_id: decisionId,
        subject: personalizedEmail?.subject,
        message_id: sendResult.messageId,
        step: nextStep,
        next_due_at: nextDue,
      },
    })

    return { outcome: 'sent' }
  }

  if (msgRecord) await db.from('email_messages').update({ status: 'failed' }).eq('id', msgRecord.id)
  await db.from('campaign_contacts').update({ status: priorStatus }).eq('id', cc.id)
  await db.from('campaign_logs').insert({
    campaign_id: cc.campaign_id,
    contact_id: cc.contact_id,
    level: 'error',
    message: `Follow-up failed: ${sendResult.error}`,
    metadata: { error: sendResult.error, status_code: sendResult.statusCode },
  })

  return { outcome: 'failed' }
}
