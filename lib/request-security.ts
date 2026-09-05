import { NextRequest, NextResponse } from 'next/server'

/** Defense-in-depth CSRF boundary for state-changing browser API requests. */
export function sameOriginOrTrustedOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin')
  if (!origin) return null
  if (origin === 'null') return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 })

  let normalizedOrigin: string
  try {
    normalizedOrigin = new URL(origin).origin
  } catch {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  }

  const trusted = new Set<string>()
  for (const value of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ]) {
    if (!value) continue
    try {
      trusted.add(new URL(value.includes('://') ? value : `https://${value}`).origin)
    } catch {
      // Ignore malformed optional deployment configuration.
    }
  }
  if (process.env.NODE_ENV !== 'production') trusted.add(request.nextUrl.origin)
  if (trusted.has(normalizedOrigin)) return null
  return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 })
}
