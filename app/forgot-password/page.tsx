'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const throttle = await fetch('/api/auth/throttle', { method: 'POST' })
      if (throttle.status === 429) {
        const body = await throttle.json().catch(() => null)
        setLoading(false)
        setError(`Too many requests. Please wait ${body?.retryAfterSeconds ? Math.ceil(body.retryAfterSeconds / 60) : 1} minute${body?.retryAfterSeconds && body.retryAfterSeconds > 60 ? 's' : ''} and try again.`)
        return
      }
    } catch {
      // Continue if the throttle gate is unreachable; Supabase limits remain.
    }
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` })
    setSent(true)
    setLoading(false)
  }

  return (
    <main id="main-content" className="main" style={{ maxWidth: 460, margin: '0 auto', paddingTop: 56 }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <img src="/e-reports-app-icon.svg" alt="E-REPORTS" width={100} height={100} style={{ width: 100, height: 100, objectFit: 'contain' }} />
        </div>
        <div className="eyebrow">Account recovery</div>
        <h1 className="title">Reset your password</h1>
        {sent ? <p role="status">If an account exists, a reset link was sent.</p> : <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 24 }}>{error && <p role="alert" className="notice error">{error}</p>}<label>Email<input value={email} onChange={e => setEmail(e.target.value)} name="email" type="email" required autoComplete="email" style={{ display: 'block', width: '100%', padding: 12, marginTop: 6, border: '1px solid #d7deea', borderRadius: 9 }} /></label><button className="btn" disabled={loading} type="submit">{loading ? 'Sending…' : 'Send reset link'}</button></form>}
        <Link href="/login" className="muted" style={{ display: 'block', marginTop: 18 }}>Back to sign in</Link>
      </div>
    </main>
  )
}
