'use client'

import { useEffect, useRef } from 'react'

interface ScoreCellInputProps {
  name: string
  defaultValue: string | number
  /** Global position among the score inputs in the grid, used for Enter-to-next-cell. */
  index: number
  /** Label for assistive tech, e.g. "Score for Jane Wanjiku". */
  ariaLabel: string
}

/**
 * Score cell for the marks matrix. Optimized for rapid entry:
 * - Enter moves focus to the next score cell (no page change, no animation),
 * - focus selects the current value so typing replaces it,
 * - tabular numerals keep columns stable,
 * - the default/value is unchanged from the server form, so the save action
 *   keeps reading exactly what it did before.
 */
export default function ScoreCellInput({ name, defaultValue, index, ariaLabel }: ScoreCellInputProps) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = ref.current
    if (!input) return
    const container = input.closest('form')
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      const cells = Array.from(
        container?.querySelectorAll<HTMLInputElement>('input.input-score-cell') ?? [],
      )
      const next = cells[index + 1]
      if (next) {
        next.focus()
        next.select()
      }
    }
    input.addEventListener('keydown', onKeyDown)
    return () => input.removeEventListener('keydown', onKeyDown)
  }, [index])

  return (
    <input
      ref={ref}
      type="number"
      name={name}
      min="0"
      max="100"
      step="0.01"
      defaultValue={defaultValue}
      placeholder="blank = absent"
      aria-label={ariaLabel}
      onFocus={(e) => e.target.select()}
      className="input-score-cell num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
    />
  )
}