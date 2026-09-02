import { NextRequest, NextResponse } from 'next/server'
import { consumeRateLimit, clientIp } from '@/lib/rate-limit'

// Brute-force preflight gate for the login and password-reset surfaces.
// Keyed on the caller's IP and, when authenticated in the request body, the
// caller's user id, so a shared NAT cannot starve every user and one account
// cannot be brute-forced cheaply.
//
// Supabase Auth's hosted rate limits remain the authoritative backstop; this
// adds per-instance defense in depth with a graceful HTTP 429 + Retry-After.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOGIN_LIMIT = 12 // attempts
const LOGIN_WINDOW_MS = 10 * 60 * 1000 // per 10 minutes

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers)

  let userId: string | null = null
  try {
    const body = await request.json().catch(() => null)
    userId = typeof body?.user === 'string' && body.user ? body.user : null
  } catch {
    // Non-JSON body is tolerated; IP keying still applies.
  }

  const key = userId ? `${ip}|${userId}` : ip
  const { allowed, retryAfterMs } = consumeRateLimit({
    key,
    scope: 'auth',
    limit: LOGIN_LIMIT,
    windowMs: LOGIN_WINDOW_MS,
  })

  if (allowed) {
    return NextResponse.json({ allowed: true, retryAfterMs: 0 })
  }

  const retryAfterSeconds = Math.ceil(Math.max(1, retryAfterMs / 1000))
  return NextResponse.json(
    { allowed: false, retryAfterMs, retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}
