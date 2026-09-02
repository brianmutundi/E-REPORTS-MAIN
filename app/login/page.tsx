'use client'

import { FormEvent, useState } from 'react'
import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShimmerButton } from '@/components/ShimmerButton'

export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [showPassword, setShowPassword] = useState(false); const [rememberMe, setRememberMe] = useState(true)
  const router = useRouter()
  async function submit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    // Brute-force preflight gate (defense in depth over Supabase Auth's own
    // hosted rate limits). Only proceeds to signInWithPassword when allowed.
    try {
      const throttle = await fetch('/api/auth/throttle', { method: 'POST' })
      if (throttle.status === 429) {
        const body = await throttle.json().catch(() => null)
        setError(`Too many sign-in attempts. Please wait ${body?.retryAfterSeconds ? Math.ceil(body.retryAfterSeconds / 60) : 1} minute${body?.retryAfterSeconds && body.retryAfterSeconds > 60 ? 's' : ''} and try again.`)
        setLoading(false)
        return
      }
    } catch {
      // If the throttle gate is unreachable, continue anyway; Supabase Auth's
      // hosted rate limits remain the authoritative backstop.
    }
    const supabase = createClient(rememberMe)
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError || !data.user) { setError('Unable to sign in with those credentials.'); setLoading(false); return }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
    if (profileError || !profile?.role) { await supabase.auth.signOut(); setError('Your account is not configured for E-REPORTS access.'); setLoading(false); return }
    router.replace(profile.role === 'super_admin' ? '/super-admin/dashboard' : '/dashboard')
  }
  return (
    <main className="min-h-[100svh] bg-slate-950 px-4 py-6 sm:px-6 sm:py-10 flex items-center justify-center overflow-x-hidden">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <div className="text-2xl sm:text-3xl font-black tracking-tight text-white"><span className="text-emerald-400">E-</span>REPORTS</div>
          <p className="mt-2 text-sm text-slate-400">Academic Portal</p>
        </div>

        <section className="rounded-3xl border border-slate-800 bg-white p-5 shadow-2xl sm:p-8">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <LogIn size={22} aria-hidden="true" />
          </div>
          <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">E-REPORTS</p>
          <h1 className="mt-2 text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Welcome back, Mwalimu</h1>
          <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-6 text-slate-500">Sign in to continue to your examination workspace.</p>

          <form onSubmit={submit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-semibold text-slate-800">Username</label>
              <div className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 transition focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
                <UserRound size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
                <input id="username" value={email} onChange={e => setEmail(e.target.value)} name="username" type="text" required autoComplete="username" placeholder="Enter your username" className="min-w-0 flex-1 bg-transparent py-3 text-base text-slate-900 outline-none placeholder:text-slate-400" />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-800">Password</label>
              <div className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 transition focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
                <LockKeyhole size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
                <input id="password" value={password} onChange={e => setPassword(e.target.value)} name="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" placeholder="Enter your password" className="min-w-0 flex-1 bg-transparent py-3 text-base text-slate-900 outline-none placeholder:text-slate-400" />
                <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="remember-me" className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
                <input id="remember-me" type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                Remember me
              </label>
              <Link href="/forgot-password" className="flex min-h-11 items-center text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">Forgot password?</Link>
            </div>

            {error && <p role="alert" className="notice error">{error}</p>}

            <ShimmerButton className="min-h-12 w-full text-base" disabled={loading} type="submit" aria-busy={loading}>
              <LogIn size={18} aria-hidden="true" />
              {loading ? 'Signing in…' : 'Login'}
            </ShimmerButton>
          </form>
        </section>
      </div>
    </main>
  )
}
