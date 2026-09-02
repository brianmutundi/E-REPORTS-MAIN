'use client'

import { useRouter } from 'next/navigation'
import type { ChangeEvent } from 'react'
import { Filter } from 'lucide-react'

export type CascadingField = {
  name: string
  label: string
  options: { value: string; label: string }[]
  placeholder: string
  disabled?: boolean
  required?: boolean
  /** Names of dependent fields to clear when this field changes. */
  clears: string[]
}

/**
 * A reusable cascading (dependent) server-side GET filter bar.
 *
 * Changing a parent field clears every dependent field below it and then
 * submits the form immediately, so the server only ever receives a valid
 * combination — stale/foreign selections are never retained. Options are
 * supplied by the server from the real tenant relationships.
 */
export default function CascadingFilterBar({
  basePath,
  fields,
  values,
  submitLabel = 'Apply',
}: {
  basePath: string
  fields: CascadingField[]
  values: Record<string, string | undefined>
  submitLabel?: string
}) {
  const router = useRouter()

  const go = (name: string, value: string, clears: string[]) => {
    const next: Record<string, string> = {}
    for (const f of fields) {
      if (f.name === name) {
        if (value) next[f.name] = value
        continue
      }
      if (clears.includes(f.name)) continue // clear dependents
      if (values[f.name]) next[f.name] = values[f.name]!
    }
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) qs.set(k, v)
    router.push(`${basePath}?${qs.toString()}`)
  }

  const onFieldChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.name
    const field = fields.find(f => f.name === name)
    go(name, e.target.value, field?.clears ?? [])
  }

  return (
    <form method="get" className="grid grid-cols-1 gap-4 md:grid-cols-5 md:items-end">
      {fields.map(field => {
        const isDisabled = Boolean(field.disabled)
        return (
          <div key={field.name}>
            <label htmlFor={`cf-${field.name}`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              {field.label}
            </label>
            <select
              id={`cf-${field.name}`}
              name={field.name}
              value={values[field.name] ?? ''}
              disabled={isDisabled}
              required={field.required}
              onChange={onFieldChange}
              className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{field.disabled ? field.placeholder : field.placeholder}</option>
              {field.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )
      })}
      <div className="md:col-span-1">
        <button type="submit" className="btn w-full md:w-auto">
          <Filter className="h-4 w-4" aria-hidden="true" />
          <span>{submitLabel}</span>
        </button>
      </div>
    </form>
  )
}
