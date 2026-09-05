'use client'

import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import PasswordInput from '@/components/PasswordInput'
import SubmitButton from '@/components/SubmitButton'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setReady(!!session))
    return () => listener.subscription.unsubscribe()
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setError('Unable to update your password. Please request a new reset link.'); setLoading(false); return }
    await supabase.auth.signOut()
    setMessage('Your password has been updated. Please sign in again.')
    setLoading(false)
    setTimeout(() => router.replace('/login'), 700)
  }

  return (
    <main id="main-content" className="main" style={{ maxWidth: 460, margin: '0 auto', paddingTop: 64 }}>
      <div className="card">
        <div className="eyebrow">Account recovery</div>
        <h1 className="title">Choose a new password</h1>
        {!ready ? (
          <p className="muted">Open this page from the password reset link in your email.</p>
        ) : (
          <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 8 }}>
            <PasswordInput
              id="new-password"
              name="new_password"
              label="New password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
            />
            <PasswordInput
              id="confirm-password"
              name="confirm_password"
              label="Confirm password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
            />
            {error && <p role="alert" className="notice error">{error}</p>}
            <SubmitButton disabled={loading}>{loading ? 'Updating…' : 'Update password'}</SubmitButton>
          </form>
        )}
        {message && <p role="status" className="mt-4">{message}</p>}
      </div>
    </main>
  )
}