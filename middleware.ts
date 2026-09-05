import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'
import { sameOriginOrTrustedOrigin } from '@/lib/request-security'
import { logEvent } from '@/lib/logger'

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
  let response = NextResponse.next({ request })
  const path = request.nextUrl.pathname
  const isApi = path.startsWith('/api/')
  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)

  const finalize = (result: NextResponse) => {
    result.headers.set('x-request-id', requestId)
    return result
  }

  if (isApi) {
    if (isStateChanging) {
      const originViolation = sameOriginOrTrustedOrigin(request)
      if (originViolation) return finalize(originViolation)
    }
    logEvent('info', 'api_request', { request_id: requestId, method: request.method, path })
    return finalize(response)
  }

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  const protectedRoute = path.startsWith('/dashboard') || path.startsWith('/super-admin')

  if (!user && protectedRoute) return finalize(NextResponse.redirect(new URL('/login', request.url)))

  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = profile?.role
    if (!role && protectedRoute) return finalize(NextResponse.redirect(new URL('/login', request.url)))
    if (path.startsWith('/super-admin') && role !== 'super_admin') return finalize(NextResponse.redirect(new URL('/dashboard', request.url)))
    if (path.startsWith('/dashboard') && role !== 'admin') return finalize(NextResponse.redirect(new URL('/super-admin/dashboard', request.url)))
    if ((path === '/login' || path === '/forgot-password') && role) return finalize(NextResponse.redirect(new URL(role === 'super_admin' ? '/super-admin/dashboard' : '/dashboard', request.url)))
  }

  return finalize(response)
}

export const config = { matcher: ['/api/:path*', '/dashboard/:path*', '/super-admin/:path*', '/login', '/forgot-password'] }
