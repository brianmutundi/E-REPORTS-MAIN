import Link from 'next/link'
import { getDashboardSession } from '@/lib/supabase/session'
import { BookOpen, ClipboardList, GraduationCap, Users } from 'lucide-react'

function nairobiGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Africa/Nairobi',
    }).format(new Date())
  )
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardPage() {
  const { supabase, user, tenantId } = await getDashboardSession()
  const greeting = nairobiGreeting()

  const [{ count: students }, { count: classes }, { count: exams }, { count: subjects }] = user && tenantId
    ? await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('classes').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('exams').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('subjects').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }]

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Dashboard Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="eyebrow">Overview</div>
          <h1 className="title">Dashboard</h1>
          <p className="muted mt-0.5">
            {greeting}, Mwalimu.
          </p>
        </div>

        <Link
          href="/dashboard/examinations"
          className="btn self-start sm:self-auto"
        >
          <ClipboardList className="h-4 w-4" />
          <span>New Examination</span>
        </Link>
      </div>

      {/* Compact overview metrics — no large Quick Actions panel. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {[
          { label: 'Students', value: students ?? 0, icon: Users },
          { label: 'Classes', value: classes ?? 0, icon: GraduationCap },
          { label: 'Learning Areas', value: subjects ?? 0, icon: BookOpen },
          { label: 'Examinations', value: exams ?? 0, icon: ClipboardList },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
            <p className="num mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
          </div>
        ))}
      </section>

    </div>
  )
}