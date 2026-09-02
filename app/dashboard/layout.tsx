import { redirect } from 'next/navigation'
import DashboardNav from '@/components/dashboard/DashboardNav'
import SessionRevalidator from '@/components/SessionRevalidator'
import { getDashboardSession } from '@/lib/supabase/session'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, tenantId, fullName, role } = await getDashboardSession()
  if (!user) redirect('/login')
  // Defense in depth: this surface is for admin (school) users only. A
  // super_admin hitting /dashboard must be sent to their own dashboard even if
  // middleware is bypassed. (middleware.ts already enforces this; this keeps the
  // boundary at the layout too.)
  if (role !== 'admin') redirect(role === 'super_admin' ? '/super-admin/dashboard' : '/login')

  let schoolName = 'E-REPORTS'
  if (tenantId) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle()
    schoolName = tenant?.name?.trim() || 'E-REPORTS'
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 md:flex md:h-screen md:overflow-hidden">
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-emerald-600 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <DashboardNav schoolName={schoolName} fullName={fullName ?? ''} />

      <main id="dashboard-main" tabIndex={-1} className="min-w-0 flex-1 overflow-x-hidden p-3 pb-8 outline-none sm:p-4 sm:pb-10 md:h-screen md:overflow-y-auto md:p-8">
        {children}
      </main>
      <SessionRevalidator />
    </div>
  )
}