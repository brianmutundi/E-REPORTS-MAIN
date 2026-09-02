// ---------------------------------------------------------------------------
// Shared server-side input validation & sanitization helpers (OWASP A03/A04).
//
// These are intentionally dependency-free and schema-lite: they enforce type
// checks, length limits and basic format rules and REJECT unexpected values
// rather than silently coercing. Keep them strict and fail-closed.
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Validates and returns a trimmed string, or null (with a reason) if invalid. */
export function checkString(value: unknown, opts: { label: string; max?: number; min?: number; allowEmpty?: boolean }): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: `${opts.label} must be a string.` }
  const trimmed = value.trim()
  const min = opts.min ?? 1
  const max = opts.max ?? 255
  if (!opts.allowEmpty && trimmed.length < min) return { ok: false, error: `${opts.label} is required.` }
  if (trimmed.length < min) return { ok: false, error: `${opts.label} is too short.` }
  if (trimmed.length > max) return { ok: false, error: `${opts.label} must be ${max} characters or fewer.` }
  return { ok: true, value: trimmed }
}

/** Validates an email address. */
export function checkEmail(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!v) return { ok: false, error: 'Email is required.' }
  if (v.length > 254) return { ok: false, error: 'Email is too long.' }
  if (!EMAIL_RE.test(v)) return { ok: false, error: 'Please enter a valid email address.' }
  return { ok: true, value: v }
}

/**
 * Validates a password with sensible, non-inflated requirements.
 * Rejects on length only (strength is the administrator's responsibility).
 */
export function checkPassword(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Password must be a string.' }
  if (value.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' }
  if (value.length > 128) return { ok: false, error: 'Password must be 128 characters or fewer.' }
  return { ok: true, value }
}

/** Validates a UUID-shaped identifier. */
export function checkId(value: unknown, label = 'ID'): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string' || value.trim().length === 0) return { ok: false, error: `${label} is required.` }
  const v = value.trim()
  const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
  if (!uuidRe.test(v)) return { ok: false, error: `${label} is invalid.` }
  return { ok: true, value: v.toLowerCase() }
}
