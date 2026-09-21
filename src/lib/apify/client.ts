// src/lib/apify/client.ts
// Apify API integration for Web Search & LinkedIn/Company detail extraction

export interface ApifySearchResult {
  title: string
  url: string
  snippet: string
  description?: string
}

export interface CompanySearchResult {
  company_about: string
  company_highlights: string[]
  sources: string[]
}

export interface PersonLinkedInSearchResult {
  person_linkedin_about: string
  person_key_insights: string[]
  sources: string[]
}

export interface CombinedApifyEnrichment {
  company_about: string
  company_highlights: string[]
  person_linkedin_about: string
  person_key_insights: string[]
  sources: string[]
  enriched_at: string
}

function getApifyApiKey(): string {
  const key = process.env.APIFY_API_KEY
  if (!key) {
    throw new Error('APIFY_API_KEY is not configured in environment variables.')
  }
  return key
}

/**
 * Executes Google Search scraper via Apify REST API
 */
export async function runApifySearch(
  query: string,
  maxItems: number = 6,
  timeoutMs: number = 15000
): Promise<ApifySearchResult[]> {
  const apiKey = getApifyApiKey()

  // Actor: apify/google-search-scraper
  const endpoint = `https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(apiKey)}`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        queries: query,
        maxPagesPerQuery: 1,
        resultsPerPage: maxItems,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Apify API Error] ${response.status}: ${errorText}`)
      throw new Error(`Apify request failed with status ${response.status}`)
    }

    const data = await response.json()
    const results: ApifySearchResult[] = []

    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.organicResults && Array.isArray(item.organicResults)) {
          for (const org of item.organicResults) {
            results.push({
              title: org.title || org.displayedUrl || '',
              url: org.url || '',
              snippet: org.description || org.snippet || '',
              description: org.description || '',
            })
          }
        } else if (item.title && (item.url || item.snippet || item.description)) {
          results.push({
            title: item.title || '',
            url: item.url || '',
            snippet: item.snippet || item.description || '',
            description: item.description || '',
          })
        }
      }
    }

    return results.slice(0, maxItems)
  } catch (error) {
    console.error(`[Apify Search Exception] Query: "${query}"`, error)
    return []
  }
}

function normalizeDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
}

function stripHtmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

  const metaDescMatch = withoutNoise.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  )
  const metaDescription = metaDescMatch?.[1]?.trim() || ''

  const bodyText = withoutNoise
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

  return [metaDescription, bodyText].filter(Boolean).join(' — ')
}

/**
 * Fetches a company's real homepage content directly (not a Google snippet).
 * Best-effort: many sites block bots or render via JS with no server-side
 * fallback, so this silently returns null on any failure and callers fall
 * back to search-based results.
 */
export async function fetchCompanyWebsiteText(
  domain: string
): Promise<{ text: string; url: string } | null> {
  const cleanDomain = normalizeDomain(domain)
  if (!cleanDomain) return null

  const candidates = [`https://${cleanDomain}`, `https://www.${cleanDomain}`]

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; A3CENDOutreachBot/1.0)' },
        redirect: 'follow',
      })
      if (!response.ok) continue

      const html = await response.text()
      const text = stripHtmlToText(html).slice(0, 1200)
      if (text.length > 60) return { text, url }
    } catch {
      continue
    }
  }

  return null
}

/**
 * 1. Search detail about Company (Company About)
 */
export async function searchCompanyAbout(
  companyName: string,
  domain?: string | null
): Promise<CompanySearchResult> {
  if (!companyName || companyName.trim() === '' || companyName === 'N/A') {
    return {
      company_about: 'Company details not provided.',
      company_highlights: [],
      sources: [],
    }
  }

  const cleanCompany = companyName.trim()
  const cleanDomain = domain && domain.trim() && domain !== 'N/A' ? normalizeDomain(domain) : null

  const searchQuery = cleanDomain
    ? `"${cleanCompany}" OR site:${cleanDomain} company about overview products services`
    : `"${cleanCompany}" company overview about services target clients`

  // Run the web search and (when we know the domain) fetch the real
  // homepage content in parallel — the homepage gives far richer, more
  // accurate context than a ~150-char Google snippet ever can, and doesn't
  // depend on the search actor returning anything for this exact query.
  //
  // Most contacts don't have company_domain explicitly set, so also try a
  // guessed domain (company name -> name.com) as a best-effort fallback —
  // it's right often enough (e.g. "A3CEND" -> a3cend.com) to be worth
  // trying. Guard against a wrong guess resolving to an unrelated site by
  // only trusting the fetch if the page actually mentions the company.
  const guessedDomain = !cleanDomain
    ? cleanCompany.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
    : null

  const [searchResults, siteContent] = await Promise.all([
    runApifySearch(searchQuery, 5),
    cleanDomain
      ? fetchCompanyWebsiteText(cleanDomain)
      : guessedDomain
        ? fetchCompanyWebsiteText(guessedDomain).then((result) => {
            const firstWord = cleanCompany.toLowerCase().split(/\s+/)[0]
            if (result && firstWord && !result.text.toLowerCase().includes(firstWord)) {
              return null // guessed domain almost certainly resolved to an unrelated site
            }
            return result
          })
        : Promise.resolve(null),
  ])

  const sources = Array.from(
    new Set([...(siteContent ? [siteContent.url] : []), ...searchResults.map((r) => r.url).filter(Boolean)])
  )

  if (!siteContent && (!searchResults || searchResults.length === 0)) {
    return {
      company_about: `No web results found via Apify for ${cleanCompany}.`,
      company_highlights: [`Operates under name ${cleanCompany}`],
      sources: [],
    }
  }

  const searchAboutText = searchResults
    .map((r) => r.snippet)
    .filter((s) => s && s.length > 15)
    .join(' ')

  const companyAboutText =
    [siteContent?.text, searchAboutText].filter(Boolean).join(' — ') || `Information about ${cleanCompany}`

  const companyHighlights = searchResults
    .map((r) => r.snippet)
    .filter((s) => s && s.length > 20)
    .slice(0, 3)

  return {
    company_about: companyAboutText.slice(0, 900),
    company_highlights:
      companyHighlights.length > 0
        ? companyHighlights
        : siteContent
          ? [`Sourced directly from ${siteContent.url}`]
          : [`Leading business in their sector (${cleanCompany})`],
    sources,
  }
}

/**
 * 2. Search detail about Person (LinkedIn & Professional About)
 */
export async function searchPersonLinkedInAbout(
  firstName: string,
  lastName?: string | null,
  company?: string | null,
  designation?: string | null,
  linkedinUrl?: string | null
): Promise<PersonLinkedInSearchResult> {
  const fullName = `${firstName} ${lastName || ''}`.trim()
  const cleanCompany = company && company !== 'N/A' ? company : ''
  const cleanTitle = designation && designation !== 'N/A' ? designation : ''

  // A known LinkedIn URL is ground truth, not a guess — search it directly
  // instead of hunting for the right profile by name. Always keep it as a
  // source even if Google has no fresh snippet indexed for it, since it's
  // still the correct, verified profile.
  if (linkedinUrl && linkedinUrl.trim()) {
    const cleanUrl = linkedinUrl.trim()
    const urlResults = await runApifySearch(`"${cleanUrl}"`, 3)
    const sources = Array.from(new Set([cleanUrl, ...urlResults.map((r) => r.url).filter(Boolean)]))

    if (urlResults.length > 0) {
      const about = urlResults.map((r) => `${r.title} — ${r.snippet}`).join(' ')
      const insights = urlResults.map((r) => r.snippet).filter((s) => s && s.length > 15).slice(0, 3)
      return {
        person_linkedin_about: about.slice(0, 800),
        person_key_insights: insights.length > 0 ? insights : [`Verified LinkedIn profile: ${cleanUrl}`],
        sources,
      }
    }

    return {
      person_linkedin_about: `Verified LinkedIn profile for ${fullName}: ${cleanUrl} (${cleanTitle || 'role'} at ${cleanCompany || 'N/A'}; no additional indexed details found).`,
      person_key_insights: [`Holds key role of ${cleanTitle || 'Professional'} at ${cleanCompany || 'organization'}`],
      sources,
    }
  }

  const directQuery = `"${fullName}" ${cleanCompany} ${cleanTitle} site:linkedin.com/in OR linkedin profile background summary`

  // Run the direct name search and a company-context search in parallel —
  // both are independent, so there's no reason to wait for the first to
  // fail before starting the second. Only the final retry (which needs the
  // company-context result) has to wait on anything.
  const [directResults, companyContextResults] = cleanCompany
    ? await Promise.all([
        runApifySearch(directQuery, 4),
        runApifySearch(
          `"${cleanCompany}" site:linkedin.com/company OR "${cleanCompany}" team OR employees OR people linkedin`,
          4
        ),
      ])
    : [await runApifySearch(directQuery, 4), []]

  let searchResults = directResults

  // Fallback: a direct name search can fail (uncommon name, sparse LinkedIn
  // presence, name variations). Instead of giving up, anchor the search on
  // the company — its real LinkedIn/web presence — then retry the person
  // search grounded in that context. This mirrors how a person would
  // actually search: can't find them directly, so look up the company
  // first, then find them through it.
  if ((!searchResults || searchResults.length === 0) && companyContextResults.length > 0) {
    searchResults = await runApifySearch(`"${fullName}" "${cleanCompany}"`, 4)
  }

  if (!searchResults || searchResults.length === 0) {
    return {
      person_linkedin_about: `Professional background summary for ${fullName} (${cleanTitle} at ${cleanCompany || 'N/A'}).`,
      person_key_insights: [`Holds key role of ${cleanTitle || 'Professional'} at ${cleanCompany || 'organization'}`],
      sources: [],
    }
  }

  const sources = searchResults.map((r) => r.url).filter(Boolean)
  const linkedinSnippetText = searchResults
    .map((r) => `${r.title} — ${r.snippet}`)
    .join(' ')

  const keyInsights = searchResults
    .map((r) => r.snippet)
    .filter((s) => s && s.length > 15)
    .slice(0, 3)

  return {
    person_linkedin_about: linkedinSnippetText.slice(0, 800),
    person_key_insights: keyInsights.length > 0 ? keyInsights : [`Responsible for decision making in ${cleanTitle || 'their group'}`],
    sources: Array.from(new Set(sources)),
  }
}

/**
 * Comprehensive Enrichment method combining Company About + Person LinkedIn About
 */
export async function performFullApifyEnrichment(params: {
  first_name: string
  last_name?: string | null
  company?: string | null
  designation?: string | null
  domain?: string | null
  linkedin_url?: string | null
}): Promise<CombinedApifyEnrichment> {
  const [companyRes, personRes] = await Promise.all([
    searchCompanyAbout(params.company || '', params.domain),
    searchPersonLinkedInAbout(
      params.first_name,
      params.last_name,
      params.company,
      params.designation,
      params.linkedin_url
    ),
  ])

  const allSources = Array.from(new Set([...companyRes.sources, ...personRes.sources]))

  return {
    company_about: companyRes.company_about,
    company_highlights: companyRes.company_highlights,
    person_linkedin_about: personRes.person_linkedin_about,
    person_key_insights: personRes.person_key_insights,
    sources: allSources,
    enriched_at: new Date().toISOString(),
  }
}
