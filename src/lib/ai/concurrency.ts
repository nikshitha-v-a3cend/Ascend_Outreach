// src/lib/ai/concurrency.ts
// Small bounded-concurrency mapper — no dependency needed for this.
//
// Why this exists: classifying/sending for large contact lists (thousands
// of rows) must never be a single sequential loop (too slow, ties up a
// request for hours) nor a single unbounded Promise.all (blasts the OpenAI
// rate limit and, on serverless, keeps running after the response is sent
// with no guarantee it finishes). This runs a fixed number of items at a
// time and always resolves once every item is done.

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await fn(items[idx], idx)
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return results
}
