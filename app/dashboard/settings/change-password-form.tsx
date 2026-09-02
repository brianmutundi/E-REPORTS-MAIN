'use client'

import { useState } from 'react'
import { changePassword } from './actions'

export default function ChangePasswordForm() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  return (
    <form
      className="card"
      style={{ display: 'grid', gap: 15 }}
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError('')
        setMessage('')
        const fd = new FormData(e.currentTarget)
        const res = await changePassword(fd)
        setBusy(false)
        if (!res.ok) setError(res.error || 'Could not change password')
        else {
          setMessage('Password updated successfully.')
          ;(e.target as HTMLFormElement).reset()
        }
      }}
    >
      <h2 className="section-heading" style={{ margin: 0, fontSize: 18 }}>Change password</h2>
      <label className="field-label">Current password<input name="current_password" type="password" required autoComplete="current-password" /></label>
      <label className="field-label">New password<input name="new_password" type="password" required minLength={8} autoComplete="new-password" /></label>
      <label className="field-label">Confirm new password<input name="confirm_password" type="password" required minLength={8} autoComplete="new-password" /></label>
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px' }}>{message}</div>}
      <button className="btn" disabled={busy} style={{ width: 'max-content' }}>{busy ? 'Saving…' : 'Update password'}</button>
    </form>
  )
}
