'use client'

import { useRouter } from 'next/navigation'

type ClassOption = {
  id: string
  name: string
}

interface ClassSwitcherProps {
  classes: ClassOption[]
  counts: Record<string, number>
  selectedClassId: string | null
}

export default function ClassSwitcher({ classes, counts, selectedClassId }: ClassSwitcherProps) {
  const router = useRouter()

  return (
    <select
      id="class_id_switch"
      name="class_id"
      defaultValue={selectedClassId ?? ''}
      onChange={(e) => {
        const value = e.target.value
        router.push(value ? `/dashboard/students?class_id=${encodeURIComponent(value)}` : '/dashboard/students')
      }}
      className="block min-h-11 w-full min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 sm:w-auto"
    >
      <option value="">Select a grade</option>
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} — {counts[c.id] ?? 0} students
        </option>
      ))}
    </select>
  )
}
