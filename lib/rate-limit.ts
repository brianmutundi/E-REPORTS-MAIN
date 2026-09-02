// ---------------------------------------------------------------------------
// Shared in-memory rate limiter (OWASP / abuse protection).
//
// Supabase Auth applies its own hosted rate limits as the authoritative
// backstop. This module adds per-instance defense in depth with graceful,
// standard HTTP 429 responses and a `Retry-After` header.
//
// Design intent — do NOT overengineer:
//   * In-memory fixed-window buckets (single-process Next deployment).
//   * Both IP and, where available, an authenticated user id are incorporated
//     into the key, so one shared NAT cannot starve every user and one user
//     cannot brute-force from many IPs within a tenant.
//   * No external store / Redis / distributed coordination required by the
//     current architecture.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server'

export type RateLimitOptions = {
  /** Number of allowed attempts within the window. */
  limit: number
  /** Window length in milliseconds. Defaults to 10 minutes. */
  windowMs?: number
  /** A stable identifier for the caller (IP, user id, route, ...). */
  key: string
  /** Optional human-readable label for diagnostics. */
  scope?: string
}

type Bucket = { count: number; windowStart: number }

const buckets = new Map<string, Bucket>()

const DEFAULT_WINDOW_MS = 10 * 60 * 1000
// Prune map once it grows beyond this many keys so memory stays bounded.
const MAX_KEYS = 10_000

function prune(now: number): void {
  if (buckets.size <= MAX_KEYS) return
  for (const [k, b] of buckets) {
    if (now - b.windowStart > DEFAULT_WINDOW_MS) buckets.delete(k)
  }
}

/**
 * Consume one attempt from the caller's bucket.
 *
 * Returns `true` if the request is allowed, `false` if rate-limited.
 * When rate-limited, `retryAfterMs` gives the time (ms) until the window resets.
 */
export function consumeRateLimit(opts: RateLimitOptions): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now()
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS
  const fullKey = `${opts.scope ?? 'rl'}:${opts.key}`

  const bucket = buckets.get(fullKey)
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(fullKey, { count: 1, windowStart: now })
    prune(now)
    return { allowed: true, retryAfterMs: 0 }
  }

  bucket.count += 1
  if (bucket.count <= opts.limit) {
    return { allowed: true, retryAfterMs: 0 }
  }

  return { allowed: false, retryAfterMs: Math.max(0, bucket.windowStart + windowMs - now) }
}

/** Derive a client IP from the standard forwarding headers. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}

/** Reset limiter state (useful for tests). */
export function _resetRateLimits(): void {
  buckets.clear()
}

/**
 * Gate an authenticated, abuse-prone endpoint (imports, generated exports,
 * report/analysis rendering). Keyed on IP + user id so a shared NAT cannot
 * starve every tenant and an individual account is bounded per route.
 *
 * Call this immediately after the caller is authenticated. When it returns a
 * `NextResponse`, short-circuit the handler with that response.
 */

export function limitAuthenticatedRoute(headers: Headers, userId: string, route: string, limit: number) {
  const ip = clientIp(headers)
  const { allowed, retryAfterMs } = consumeRateLimit({
    key: `${ip}|${userId}|${route}`,
    scope: 'route',
    limit,
    windowMs: 60 * 1000, // per-minute budget; generous for legitimate bulk work
  })
  if (allowed) return null
  const retryAfterSeconds = Math.ceil(Math.max(1, retryAfterMs / 1000))
  return NextResponse.json(
    { error: 'Rate limit exceeded. Please wait before trying again.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}
