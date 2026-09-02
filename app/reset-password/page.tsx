'use client'

import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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

  return <main className="main" style={{ maxWidth: 460, margin: '0 auto', paddingTop: 80 }}><div className="card"><div className="eyebrow">Account recovery</div><h1 className="title">Choose a new password</h1>{!ready ? <p className="muted">Open this page from the password reset link in your email.</p> : <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}><label>New password<input value={password} onChange={e => setPassword(e.target.value)} type="password" minLength={8} required autoComplete="new-password" style={{ display:'block',width:'100%',padding:12,marginTop:6,border:'1px solid #d7deea',borderRadius:9 }}/></label><label>Confirm password<input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" minLength={8} required autoComplete="new-password" style={{ display:'block',width:'100%',padding:12,marginTop:6,border:'1px solid #d7deea',borderRadius:9 }}/></label>{error&&<p role="alert" style={{color:'#b42318'}}>{error}</p>}<button className="btn" disabled={loading} type="submit">{loading?'Updating…':'Update password'}</button></form>}{message&&<p>{message}</p>}</div></main>
}
