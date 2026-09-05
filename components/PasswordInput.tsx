'use client'

import { useState } from 'react'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'

interface PasswordInputProps {
  id: string
  name: string
  label: string
  autoComplete: string
  value?: string
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  defaultValue?: string
  placeholder?: string
  required?: boolean
  minLength?: number
}

/**
 * Password field with a show/hide visibility toggle, matching the login form's
 * look and keyboard behaviour. Works controlled (value/onChange) or
 * uncontrolled (defaultValue or plain FormData reads via `name`).
 */
export default function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  value,
  onChange,
  defaultValue,
  placeholder,
  required = true,
  minLength,
}: PasswordInputProps) {
  const [show, setShow] = useState(false)

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-800">{label}</label>
      <div className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 transition focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
        <LockKeyhole size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
        <input
          id={id}
          name={name}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          defaultValue={defaultValue}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent py-3 text-base text-slate-900 outline-none placeholder:text-slate-400"
        />
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
        >
          {show ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}