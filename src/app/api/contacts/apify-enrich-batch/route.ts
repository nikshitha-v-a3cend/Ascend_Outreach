// src/app/api/contacts/apify-enrich-batch/route.ts
import { NextResponse } from 'next/server'
import { batchEnrichContactsWithApify } from '@/lib/apify/enrichment'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { contactIds } = body

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json(
        { error: 'contactIds array is required' },
        { status: 400 }
      )
    }

    const summary = await batchEnrichContactsWithApify(contactIds)

    return NextResponse.json({
      message: `Batch Apify enrichment finished: ${summary.succeeded}/${summary.total} successful`,
      summary,
    })
  } catch (error: any) {
    console.error('Error in batch Apify enrichment route:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
