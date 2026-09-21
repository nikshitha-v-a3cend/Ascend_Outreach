// src/lib/ai/profile.ts
// Safe merging for a contact's ai_profile field.
//
// ai_profile must always be a plain object. If it is ever anything else —
// most commonly a JSON-encoded STRING (this happens if the underlying
// column is TEXT rather than JSONB, so it round-trips through Postgres as
// a string instead of a parsed value) — spreading it directly with
// `{...bad, ...new}` explodes it into per-character keys, and if that gets
// written back, every later read/merge re-spreads and compounds it further
// (each round re-stringifying and re-spreading the last, growing ~10x per
// round). A string is recovered by parsing it back into the object it
// actually represents; anything else unparseable/non-object falls back to
// {} rather than exploding.

export function safeAiProfile(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Not valid JSON — fall through to {}
    }
  }

  return {}
}

export function mergeAiProfile(
  existing: unknown,
  updates: object
): Record<string, unknown> {
  return { ...safeAiProfile(existing), ...updates }
}
