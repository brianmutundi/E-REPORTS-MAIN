import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
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
  const path = request.nextUrl.pathname
  const protectedRoute = path.startsWith('/dashboard') || path.startsWith('/super-admin')

  if (!user && protectedRoute) return NextResponse.redirect(new URL('/login', request.url))

  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = profile?.role
    if (!role && protectedRoute) return NextResponse.redirect(new URL('/login', request.url))
    if (path.startsWith('/super-admin') && role !== 'super_admin') return NextResponse.redirect(new URL('/dashboard', request.url))
    if (path.startsWith('/dashboard') && role !== 'admin') return NextResponse.redirect(new URL('/super-admin/dashboard', request.url))
    if ((path === '/login' || path === '/forgot-password') && role) return NextResponse.redirect(new URL(role === 'super_admin' ? '/super-admin/dashboard' : '/dashboard', request.url))
  }

  return response
}

export const config = { matcher: ['/dashboard/:path*', '/super-admin/:path*', '/login', '/forgot-password'] }
