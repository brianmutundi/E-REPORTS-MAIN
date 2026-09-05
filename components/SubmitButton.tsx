'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  /** Shown in place of `children` while the form is submitting. */
  pendingLabel?: string
}

/**
 * Submit button with a built-in pending state (via useFormStatus). Renders a
 * small inline spinner and disables itself while the enclosing form's server
 * action is running, so the same form can never be submitted twice.
 */
export default function SubmitButton({ children, pendingLabel, className, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus()
  const isDisabled = disabled || pending

  return (
    <button type="submit" {...props} className={className} disabled={isDisabled} aria-busy={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      <span>{pending ? (pendingLabel ?? 'Saving…') : children}</span>
    </button>
  )
}