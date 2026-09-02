'use client'

import { useFormStatus } from 'react-dom'
import { Save } from 'lucide-react'

export default function SaveMarksButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      className="btn"
      disabled={pending}
      aria-busy={pending}
    >
      <Save className="h-4 w-4" aria-hidden="true" />
      {pending ? 'Saving…' : 'Save marks'}
    </button>
  )
}