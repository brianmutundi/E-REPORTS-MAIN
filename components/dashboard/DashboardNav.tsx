'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Settings2,
  Users,
  FileText,
  SlidersHorizontal,
  Menu,
  X,
  ChevronRight,
  BarChart3,
  Award,
} from 'lucide-react'
import SignOutButton from '@/components/SignOutButton'

const navGroups = [
  {
    label: 'Overview',
    items: [{ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Academic setup',
    items: [
      { name: 'Learners', href: '/dashboard/students', icon: Users },
      { name: 'Grades', href: '/dashboard/classes', icon: GraduationCap },
      { name: 'Streams', href: '/dashboard/streams', icon: ListChecks },
      { name: 'Learning Areas', href: '/dashboard/subjects', icon: BookOpen },
    ],
  },
  {
    label: 'Assessment',
    items: [
      { name: 'Assessments', href: '/dashboard/examinations', icon: ClipboardList },
      { name: 'Marks Entry', href: '/dashboard/marks', icon: ListChecks },
      { name: 'Broadsheet', href: '/dashboard/results', icon: FileText },
      { name: 'Analysis', href: '/dashboard/analysis', icon: BarChart3 },
      { name: 'Report Forms', href: '/dashboard/reports', icon: Award },
      { name: 'Grading', href: '/dashboard/grading', icon: Settings2 },
    ],
  },
  {
    label: 'Administration',
    items: [{ name: 'School Profile', href: '/dashboard/settings', icon: SlidersHorizontal }],
  },
]

export default function DashboardNav({ schoolName, fullName }: { schoolName: string; fullName: string }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (!mobileMenuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const initial = schoolName.charAt(0).toUpperCase() || 'E'
  const userInitial = fullName.charAt(0).toUpperCase() || 'U'

  return (
    <>
      {/* Mobile application header */}
      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-slate-200 bg-white/95 px-3 shadow-sm backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="dashboard-nav"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1 px-2 text-center">
          <div className="mx-auto max-w-[calc(100vw-7rem)] truncate text-sm font-bold tracking-tight text-slate-900" title={schoolName}>
            {schoolName}
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">Academic Portal</div>
        </div>

        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow-sm ring-4 ring-emerald-50"
          aria-label={fullName ? `Signed in as ${fullName}` : 'User profile'}
          title={fullName || 'User profile'}
        >
          {userInitial}
        </div>
      </header>

      {/* Mobile drawer backdrop */}
      <button
        type="button"
        aria-label="Close navigation menu"
        aria-hidden={!mobileMenuOpen}
        tabIndex={mobileMenuOpen ? 0 : -1}
        onClick={() => setMobileMenuOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-200 md:hidden ${
          mobileMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Responsive navigation drawer / desktop sidebar */}
      <aside
        id="dashboard-nav"
        className={`fixed inset-y-0 left-0 z-50 w-[min(19rem,88vw)] shrink-0 overflow-hidden border-r border-slate-200 bg-white text-slate-700 shadow-xl transition-transform duration-200 ease-out md:static md:h-screen md:w-72 md:translate-x-0 md:border-slate-800 md:bg-slate-900 md:text-slate-300 md:shadow-none ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
        role={mobileMenuOpen ? 'dialog' : undefined}
        aria-modal={mobileMenuOpen ? true : undefined}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4 md:border-slate-800 md:px-5 md:py-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-sm">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-bold tracking-tight text-slate-900 md:text-white" title={schoolName}>
                {schoolName}
              </h1>
              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">Academic Portal</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 md:hidden"
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-4" aria-label="Primary">
            <div className="space-y-5">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 md:text-slate-500">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive =
                        pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(`${item.href}/`))

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          aria-current={isActive ? 'page' : undefined}
                          className={`group flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                            isActive
                              ? 'border-emerald-100 bg-emerald-50 text-emerald-700 md:border-emerald-500/20 md:bg-emerald-500/15 md:text-emerald-300'
                              : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:text-slate-400 md:hover:bg-slate-800/60 md:hover:text-slate-200'
                          }`}
                        >
                          <Icon
                            className={`h-5 w-5 shrink-0 ${
                              isActive ? 'text-emerald-600 md:text-emerald-300' : 'text-slate-400 md:text-slate-500'
                            }`}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate">{item.name}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 md:hidden" aria-hidden="true" />
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          <div className="border-t border-slate-200 bg-slate-50 p-3 md:border-slate-800 md:bg-slate-900/50 md:p-4">
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200 md:bg-slate-800/60 md:ring-slate-700/60">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 md:bg-slate-700 md:text-slate-200">
                {userInitial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-800 md:text-slate-200">{fullName || 'Account'}</p>
                <p className="text-[10px] text-slate-400">Signed in</p>
              </div>
            </div>
            <SignOutButton />
          </div>
        </div>
      </aside>
    </>
  )
}