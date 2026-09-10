// src/app/api/campaigns/[id]/send-test/route.ts
// Send a test email using a specific template — server-side only

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerSupabase } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/sendgrid/client'

const SendTestSchema = z.object({
  test_email: z.string().email('Valid test email is required'),
  template_type: z.enum(['initial_outreach', 'no_open', 'opened_no_reply']).optional().default('initial_outreach'),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  try {
    const body = await req.json()
    const parsed = SendTestSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const { test_email, template_type } = parsed.data
    const db = getServerSupabase()

    const { data: campaign } = await db.from('campaigns').select('*').eq('id', campaignId).single()
    if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })

    const templateId =
      template_type === 'initial_outreach' ? campaign.initial_template_id
      : template_type === 'no_open' ? campaign.no_open_template_id
      : campaign.opened_no_reply_template_id

    if (!templateId) {
      return Response.json({ error: `Template ID for "${template_type}" is not configured` }, { status: 400 })
    }

    const result = await sendEmail({
      to: test_email,
      fromEmail: campaign.from_email,
      fromName: campaign.from_name,
      templateId,
      dynamicTemplateData: {
        firstName: 'Test',
        lastName: 'User',
        email: test_email,
        company: 'Test Company',
        designation: 'Test Role',
      },
      customArgs: {
        campaign_id: campaignId,
        sequence_step: '0', // 0 = test send
      },
    })

    if (result.success) {
      return Response.json({
        success: true,
        message: `Test email sent to ${test_email}`,
        message_id: result.messageId,
      })
    } else {
      return Response.json({
        success: false,
        error: result.error,
        status_code: result.statusCode,
      }, { status: 422 })
    }
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Test send failed' },
      { status: 500 }
    )
  }
}
