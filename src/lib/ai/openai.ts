// src/lib/ai/openai.ts
// Secure server-side OpenAI client abstraction

import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY
const defaultModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'

if (!apiKey) {
  console.warn('[AI] OPENAI_API_KEY is not configured')
}

export const openai = new OpenAI({
  apiKey: apiKey || 'dummy-key',
})

export async function generateStructuredJson<T>(params: {
  systemPrompt: string
  userPrompt: string
  schemaDescription?: string
  temperature?: number
  model?: string
}): Promise<T> {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  const response = await openai.chat.completions.create({
    model: params.model || defaultModel,
    temperature: params.temperature ?? 0.3,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `${params.systemPrompt}\n\nIMPORTANT: You must output ONLY a valid JSON object matching the requested schema.${params.schemaDescription ? ` Schema details: ${params.schemaDescription}` : ''}`,
      },
      {
        role: 'user',
        content: params.userPrompt,
      },
    ],
  })

  const raw = response.choices[0]?.message?.content
  if (!raw) {
    throw new Error('Empty response received from OpenAI')
  }

  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.error('[AI] Failed to parse JSON response:', raw)
    throw new Error(`JSON parsing failed from AI response: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}
