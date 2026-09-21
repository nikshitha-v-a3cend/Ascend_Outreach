// src/lib/ai/a3cendKnowledge.ts
// Fetches A3CEND's own real marketing copy from a3cend.com at runtime, so
// the AI's understanding of what A3CEND actually offers comes from the
// live site instead of a hardcoded description that goes stale the moment
// the product or its positioning changes. Cached in-memory with a TTL —
// every email generation call doesn't need to re-fetch and re-parse an
// ~1MB JS bundle, and a slow/down site never blocks a send.

const SITE_URL = 'https://a3cend.com/'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours
const FETCH_TIMEOUT_MS = 8000
const MAX_SNIPPETS = 18

let cache: { content: string; fetchedAt: number } | null = null

function extractBundleUrl(html: string): string | null {
  const match = html.match(/<script[^>]+type="module"[^>]+src="([^"]+\.js)"/i)
  if (!match) return null
  const src = match[1]
  return src.startsWith('http') ? src : new URL(src, SITE_URL).toString()
}

function looksLikeMarketingProse(s: string): boolean {
  const words = s.split(/\s+/)
  if (words.length < 5) return false
  if (!/\b(is|are|to|the|a|an|of|and|for|with|that|helps|combines|provides|build|your|you|we|our)\b/i.test(s)) return false
  if (/^(Select|Choose|Enter|Add|Edit|Delete|Save|Cancel|Loading|Search|Filter|Sort by|Click|Upload|Download)\b/i.test(s)) return false
  if (/\b(privacy policy|terms and conditions|cookies?|intellectual property|prior agreements|personal information|these terms|reserve the right)\b/i.test(s)) return false
  return true
}

function scoreSnippet(s: string): number {
  let score = 0
  if (/A3CEND|REHEARSE|SELLIQ|SellIQ/i.test(s)) score += 3
  if (s.length > 60) score += 1
  if (/\.$/.test(s)) score += 1
  return score
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; A3CENDOutreachBot/1.0)' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`)
  return res.text()
}

async function fetchLivePositioning(): Promise<string> {
  const html = await fetchWithTimeout(SITE_URL, FETCH_TIMEOUT_MS)
  const bundleUrl = extractBundleUrl(html)
  if (!bundleUrl) throw new Error('Could not locate site bundle URL')

  const bundle = await fetchWithTimeout(bundleUrl, FETCH_TIMEOUT_MS)
  const matches = bundle.match(/"[A-Z][a-zA-Z0-9 ,.'!?%:&()-]{25,240}"/g) || []
  const unique = Array.from(new Set(matches.map((s) => s.slice(1, -1))))

  const snippets = unique
    .filter(looksLikeMarketingProse)
    .map((text) => ({ text, score: scoreSnippet(text) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SNIPPETS)
    .map((s) => `- ${s.text}`)

  if (snippets.length === 0) throw new Error('No usable marketing content extracted')
  return snippets.join('\n')
}

/**
 * Returns A3CEND's current real marketing copy, fetched live from
 * a3cend.com and cached for CACHE_TTL_MS. Falls back to the last
 * successfully fetched content (even if stale) if a refresh fails, and to
 * null if nothing has ever been fetched successfully — callers should fall
 * back to a static description in that case.
 */
export async function getA3cendLivePositioning(): Promise<string | null> {
  const isFresh = cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS
  if (isFresh) return cache!.content

  try {
    const content = await fetchLivePositioning()
    cache = { content, fetchedAt: Date.now() }
    return content
  } catch (err) {
    console.warn('[A3CEND Knowledge] Live fetch failed, using cached/fallback:', err)
    return cache?.content ?? null
  }
}
