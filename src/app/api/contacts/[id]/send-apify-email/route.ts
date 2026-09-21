// src/app/api/contacts/[id]/send-apify-email/route.ts
// Generate & Send Apify-enhanced outreach email via OpenAI + SendGrid

import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { enrichContactWithApify } from '@/lib/apify/enrichment'
import { generatePersonalizedEmail } from '@/lib/ai/service'
import { sendEmail } from '@/lib/sendgrid/client'
import { safeAiProfile } from '@/lib/ai/profile'
import { getErrorMessage } from '@/lib/supabase/retry'
import type { Contact } from '@/lib/supabase/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params
    if (!contactId) {
      return NextResponse.json({ error: 'Contact ID is required' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const isPreview = body.preview === true

    const supabase = getServerSupabase()

    // 1. Fetch Contact
    const { data: rawContact, error: fetchError } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    if (fetchError || !rawContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    let contact = { ...(rawContact as unknown as Contact), ai_profile: safeAiProfile(rawContact.ai_profile) as any }

    // 2. Ensure Apify enrichment is present
    if (!contact.ai_profile?.apify_enrichment) {
      const enrichResult = await enrichContactWithApify(contactId)
      if (enrichResult.contact) {
        contact = { ...enrichResult.contact, ai_profile: safeAiProfile(enrichResult.contact.ai_profile) as any }
      }
    }

    // 3. Generate Apify-Tailored AI Email
    const fromName = body.fromName || process.env.NEXT_PUBLIC_SENDGRID_FROM_NAME || 'A3CEND'
    const fromEmail = body.fromEmail || process.env.NEXT_PUBLIC_SENDGRID_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL

    if (!fromEmail) {
      return NextResponse.json(
        { error: 'No sender email configured — set SENDGRID_FROM_EMAIL or pass fromEmail in the request.' },
        { status: 400 }
      )
    }

    const generatedEmail = await generatePersonalizedEmail({
      contact,
      campaign: {
        name: 'Apify Web Research Direct Outreach',
        from_name: fromName,
        from_email: fromEmail,
      },
      step: 1,
      decision: {
        action: 'SEND_FIRST_EMAIL',
        reason: 'Apify web intelligence (Company About + Person LinkedIn About) extracted.',
        strategy: 'Hyper-personalized outreach referencing real company focus and person LinkedIn background.',
        tone: 'Consultative, crisp & peer-to-peer',
      },
      previous_emails: [],
      interaction_summary: {
        opened_count: 0,
        replied: false,
      },
      custom_instructions: body.customInstructions,
    })

    // 4. Return preview if requested
    if (isPreview) {
      return NextResponse.json({
        preview: true,
        subject: generatedEmail.subject,
        body_text: generatedEmail.body_text,
        body_html: generatedEmail.body_html,
        recipient_analysis: generatedEmail.recipient_analysis,
        personalization_highlights: generatedEmail.personalization_highlights,
        contact,
      })
    }

    // 5. Send via SendGrid
    const sendResult = await sendEmail({
      to: contact.email,
      fromEmail,
      fromName,
      subject: generatedEmail.subject,
      html: generatedEmail.body_html,
      text: generatedEmail.body_text,
      customArgs: {
        contact_id: contactId,
        sequence_step: '1',
      },
    })

    if (!sendResult.success) {
      return NextResponse.json(
        { error: sendResult.error || 'Failed to send email via SendGrid' },
        { status: 500 }
      )
    }

    // 6. Log email message in database if table exists
    try {
      await supabase.from('email_messages').insert({
        contact_id: contactId,
        step: 1,
        template_type: 'ai_personalized',
        subject: generatedEmail.subject,
        body_text: generatedEmail.body_text,
        body_html: generatedEmail.body_html,
        sendgrid_message_id: sendResult.messageId || null,
        status: 'sent',
        sent_at: new Date().toISOString(),
      } as any)
    } catch (dbErr) {
      console.warn('Note: Could not log to email_messages table', dbErr)
    }

    return NextResponse.json({
      success: true,
      message: `Apify-tailored email sent to ${contact.email}!`,
      messageId: sendResult.messageId,
      subject: generatedEmail.subject,
      body_text: generatedEmail.body_text,
      body_html: generatedEmail.body_html,
      recipient_analysis: generatedEmail.recipient_analysis,
    })
  } catch (error: unknown) {
    console.error('Error in send-apify-email route:', error)
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to send Apify email' },
      { status: 500 }
    )
  }
}
