// src/lib/supabase/retry.ts
// Retries a Supabase call on transient network failures.
//
// supabase-js catches connection-level errors (TLS handshake drops, DNS
// blips, ECONNRESET) itself and returns them via the `error` field of the
// result rather than throwing — a plain try/catch around the call never
// sees them. This inspects that field instead and retries with backoff,
// so a request doesn't fail outright just because one network round trip
// hit a transient blip.

const RETRYABLE_PATTERNS = [
  /fetch failed/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /EAI_AGAIN/i,
  /socket disconnected/i,
  /network/i,
]

// Supabase/Postgrest errors are plain objects ({message, details, hint,
// code}) — NOT `instanceof Error` — so `error instanceof Error ? ... :
// String(error)` skips right past the real `.message` and stringifies the
// whole object instead, producing the literal text "[object Object]" any
// time a real Supabase API error (not a network exception) occurs. Always
// check for a `.message` property before falling back to String().
export function getErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error'
  if (error instanceof Error) return error.message
  if (typeof (error as { message?: unknown })?.message === 'string') {
    return (error as { message: string }).message
  }
  return String(error)
}

function isRetryable(error: unknown): boolean {
  if (!error) return false
  return RETRYABLE_PATTERNS.some((pattern) => pattern.test(getErrorMessage(error)))
}

export async function withSupabaseRetry<T>(
  fn: () => PromiseLike<{ data: T; error: unknown }>,
  options: { retries?: number; delayMs?: number } = {}
): Promise<{ data: T; error: unknown }> {
  const retries = options.retries ?? 2
  const delayMs = options.delayMs ?? 1000

  let result: { data: T; error: unknown }
  for (let attempt = 0; ; attempt++) {
    result = await fn()
    if (!result.error || !isRetryable(result.error) || attempt >= retries) return result

    console.warn(`[Supabase Retry] Transient error, retrying (${attempt + 1}/${retries}): ${getErrorMessage(result.error)}`)
    await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)))
  }
}
