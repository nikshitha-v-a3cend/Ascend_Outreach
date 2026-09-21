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

function isRetryable(error: unknown): boolean {
  if (!error) return false
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === 'string'
        ? (error as { message: string }).message
        : String(error)
  return RETRYABLE_PATTERNS.some((pattern) => pattern.test(message))
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

    const message = result.error instanceof Error ? result.error.message : String(result.error)
    console.warn(`[Supabase Retry] Transient error, retrying (${attempt + 1}/${retries}): ${message}`)
    await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)))
  }
}
