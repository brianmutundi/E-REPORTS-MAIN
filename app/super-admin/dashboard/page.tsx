import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TenantForm, AdminForm } from './ActionsForm'
import { toggleTenantStatus, deleteTenant, signOut } from '../actions'
import { Building2, ShieldCheck, Users, Power, Trash2, LogOut } from 'lucide-react'

export default async function SuperAdminDashboard() {
  const supabase = await createClient()

  // Defense in depth: this surface is for platform owners only. An admin (or
  // unauthenticated user) hitting /super-admin must be sent away even if the
  // middleware is bypassed. (middleware.ts already enforces this; this keeps
  // the boundary at the page render too.)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'super_admin') redirect('/dashboard')

  const [{ data: tenants }, { data: admins }] = await Promise.all([
    supabase
      .from('tenants')
      .select('id, name, code, status, created_at')
      .order('name'),
    supabase
      .from('profiles')
      .select('id, full_name, tenant_id, created_at')
      .eq('role', 'admin')
      .order('full_name'),
  ])

  const adminsByTenant = new Map<string, string[]>()
  for (const admin of admins ?? []) {
    if (admin.tenant_id) {
      adminsByTenant.set(admin.tenant_id, [
        ...(adminsByTenant.get(admin.tenant_id) ?? []),
        admin.full_name,
      ])
    }
  }

  return (
    <main className="main" style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 16px' }}>
      {/* Top Header Section with Logout */}
      <div className="top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="eyebrow">Platform administration</div>
          <h1 className="title">Super Admin</h1>
          <p className="muted">Onboard schools and manage their administrator access.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="report-status" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={15} /> Platform owner
          </span>

          <form action={signOut}>
            <button
              type="submit"
              className="button-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                color: '#ef4444',
                borderColor: 'rgba(239, 68, 68, 0.2)',
              }}
            >
              <LogOut size={15} /> Sign Out
            </button>
          </form>
        </div>
      </div>

      {/* Metrics Row */}
      <section className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 18 }}>
        <div className="card">
          <Building2 size={20} />
          <div className="muted">Schools</div>
          <div className="metric" style={{ fontSize: 24, fontWeight: 'bold' }}>{tenants?.length ?? 0}</div>
        </div>
        <div className="card">
          <Users size={20} />
          <div className="muted">Administrators</div>
          <div className="metric" style={{ fontSize: 24, fontWeight: 'bold' }}>{admins?.length ?? 0}</div>
        </div>
      </section>

      {/* Onboarding Forms */}
      <section className="card" style={{ marginTop: 18 }}>
        <h2>Create school</h2>
        <p className="muted">Create a tenant before assigning its administrator.</p>
        <TenantForm />
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Create administrator</h2>
        <p className="muted">The administrator is assigned directly to the selected school.</p>
        <AdminForm tenants={(tenants ?? []).map((t) => ({ id: t.id, name: t.name }))} />
      </section>

      {/* Managed Schools Cards */}
      <section className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 18 }}>
        {(tenants ?? []).map((t) => (
          <article className="card" key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0 }}>{t.name}</h3>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontWeight: 600,
                      backgroundColor: t.status === 'inactive' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      color: t.status === 'inactive' ? '#ef4444' : '#10b981',
                    }}
                  >
                    {t.status || 'active'}
                  </span>
                </div>
                <p className="muted" style={{ margin: '4px 0 0 0' }}>{t.code || 'No tenant code'}</p>
              </div>

              {/* Action Controls for School (Toggle / Delete) */}
              <div style={{ display: 'flex', gap: 6 }}>
                <form action={toggleTenantStatus.bind(null, t.id, t.status || 'active')}>
                  <button
                    type="submit"
                    title="Toggle School Active Status"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#f59e0b' }}
                  >
                    <Power size={18} />
                  </button>
                </form>

                <form action={deleteTenant.bind(null, t.id)}>
                  <button
                    type="submit"
                    title="Delete School"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}
                  >
                    <Trash2 size={18} />
                  </button>
                </form>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
              <strong>Administrators</strong>
              {(adminsByTenant.get(t.id) ?? []).length ? (
                <ul style={{ paddingLeft: 18, margin: '8px 0 0 0' }}>
                  {adminsByTenant.get(t.id)!.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ margin: '6px 0 0 0' }}>No administrators assigned.</p>
              )}
            </div>
          </article>
        ))}

        {!(tenants ?? []).length && (
          <div className="card">
            <p className="muted">No schools have been created yet.</p>
          </div>
        )}
      </section>
    </main>
  )
}