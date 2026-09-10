// src/lib/sendgrid/client.ts
// SendGrid server-side email client
// NEVER import in browser/client components

import sgMail from '@sendgrid/mail'
import type { MailDataRequired } from '@sendgrid/mail'

const apiKey = process.env.SENDGRID_API_KEY

if (!apiKey) {
  console.warn('[SendGrid] SENDGRID_API_KEY is not set')
} else {
  sgMail.setApiKey(apiKey)
}

export interface SendEmailOptions {
  to: string
  fromEmail: string
  fromName: string
  replyTo?: string
  templateId: string
  dynamicTemplateData: {
    firstName?: string
    lastName?: string
    email?: string
    company?: string
    designation?: string
    [key: string]: string | undefined
  }
  // NON-PII identifiers only
  customArgs?: {
    campaign_id?: string
    contact_id?: string
    campaign_contact_id?: string
    sequence_step?: string
  }
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
  statusCode?: number
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  if (!apiKey) {
    return {
      success: false,
      error: 'SendGrid API key not configured',
    }
  }

  const msg: MailDataRequired = {
    to: options.to,
    from: {
      email: options.fromEmail,
      name: options.fromName,
    },
    replyTo: options.replyTo || options.fromEmail,
    templateId: options.templateId,
    dynamicTemplateData: options.dynamicTemplateData,
    customArgs: options.customArgs
      ? Object.fromEntries(
          Object.entries(options.customArgs)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        )
      : undefined,
  }

  try {
    const [response] = await sgMail.send(msg)
    const messageId = response.headers['x-message-id'] as string | undefined

    console.log('[SendGrid] Email sent', {
      to_masked: options.to.replace(/(.{2}).+(@.+)/, '$1***$2'),
      template_id: options.templateId,
      campaign_id: options.customArgs?.campaign_id,
      contact_id: options.customArgs?.contact_id,
      status_code: response.statusCode,
      message_id: messageId,
    })

    return {
      success: true,
      messageId,
      statusCode: response.statusCode,
    }
  } catch (err: unknown) {
    const error = err as { response?: { status?: number; body?: { errors?: Array<{ message: string }> } }; message?: string }
    const statusCode = error?.response?.status
    const sgErrors = error?.response?.body?.errors
    const errorMessage = sgErrors?.[0]?.message || error?.message || 'Unknown SendGrid error'

    console.error('[SendGrid] Email send failed', {
      error: errorMessage,
      status_code: statusCode,
      template_id: options.templateId,
      campaign_id: options.customArgs?.campaign_id,
      contact_id: options.customArgs?.contact_id,
    })

    return {
      success: false,
      error: errorMessage,
      statusCode,
    }
  }
}

export async function verifySendGridConnection(): Promise<boolean> {
  return Boolean(apiKey && apiKey.startsWith('SG.'))
}
