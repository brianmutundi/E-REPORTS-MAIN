'use client'

import { useState } from 'react'
import { changePassword } from './actions'
import PasswordInput from '@/components/PasswordInput'
import SubmitButton from '@/components/SubmitButton'

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
      <PasswordInput
        id="current-password"
        name="current_password"
        label="Current password"
        autoComplete="current-password"
      />
      <PasswordInput
        id="new-password"
        name="new_password"
        label="New password"
        autoComplete="new-password"
        minLength={8}
      />
      <PasswordInput
        id="confirm-password"
        name="confirm_password"
        label="Confirm new password"
        autoComplete="new-password"
        minLength={8}
      />
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px' }}>{message}</div>}
      <SubmitButton style={{ width: 'max-content' }} disabled={busy}>{busy ? 'Saving…' : 'Update password'}</SubmitButton>
    </form>
  )
}