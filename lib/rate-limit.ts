// ---------------------------------------------------------------------------
// Shared in-memory rate limiter (OWASP / abuse protection).
//
// Supabase Auth applies its own hosted rate limits as the authoritative
// backstop. This module adds per-instance defense in depth with graceful,
// standard HTTP 429 responses and a `Retry-After` header.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server'
import { logEvent } from './logger'

export type RateLimitOptions = {
  limit: number
  windowMs?: number
  key: string
  scope?: string
}

type Bucket = { count: number; windowStart: number }

const buckets = new Map<string, Bucket>()
const DEFAULT_WINDOW_MS = 10 * 60 * 1000
const MAX_KEYS = 10_000

function prune(now: number): void {
  if (buckets.size <= MAX_KEYS) return
  for (const [k, b] of buckets) {
    if (now - b.windowStart > DEFAULT_WINDOW_MS) buckets.delete(k)
  }
}

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
  if (bucket.count <= opts.limit) return { allowed: true, retryAfterMs: 0 }
  return { allowed: false, retryAfterMs: Math.max(0, bucket.windowStart + windowMs - now) }
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}

export function _resetRateLimits(): void { buckets.clear() }

export function limitAuthenticatedRoute(headers: Headers, userId: string, route: string, limit: number) {
  const ip = clientIp(headers)
  const { allowed, retryAfterMs } = consumeRateLimit({
    key: `${ip}|${userId}|${route}`,
    scope: 'route',
    limit,
    windowMs: 60 * 1000,
  })
  if (allowed) return null
  const retryAfterSeconds = Math.ceil(Math.max(1, retryAfterMs / 1000))
  logEvent('warn', 'rate_limit_blocked', { scope: 'route', route, ip, user_id: userId, limit })
  return NextResponse.json(
    { error: 'Rate limit exceeded. Please wait before trying again.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}
