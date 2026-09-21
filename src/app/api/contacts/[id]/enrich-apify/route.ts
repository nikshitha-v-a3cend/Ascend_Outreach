// src/app/api/contacts/[id]/enrich-apify/route.ts
import { NextResponse } from 'next/server'
import { enrichContactWithApify } from '@/lib/apify/enrichment'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params
    if (!contactId) {
      return NextResponse.json({ error: 'Contact ID is required' }, { status: 400 })
    }

    const result = await enrichContactWithApify(contactId)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Apify web search enrichment completed successfully',
      contact: result.contact,
      apifyData: result.apifyData,
    })
  } catch (error: any) {
    console.error('Error in Apify enrichment route:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
