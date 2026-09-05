import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type DashboardSession = {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string; email?: string | null } | null
  tenantId: string | null
  fullName: string | null
  role: string | null
}

/**
 * Single authenticated data-plane check for a server render (or server action).
 * Cached per render so the layout, the page and the libs they call all share
 * one getUser call and one profile query instead of repeating them.
 */
export const getDashboardSession = cache(
  async (): Promise<DashboardSession> => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { supabase, user: null, tenantId: null, fullName: null, role: null }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id,full_name,role')
      .eq('id', user.id)
      .maybeSingle()

    let tenantId = profile?.tenant_id ?? null
    // A deactivated school must not continue to access its data. Only
    // administrators carry a tenant_id, so gate the whole school's data plane
    // here and let every page's existing "No school is linked" guard handle it.
    if (tenantId && profile?.role === 'admin') {
      const { data: tenant } = await supabase.from('tenants').select('status').eq('id', tenantId).maybeSingle()
      if (tenant && tenant.status === 'inactive') tenantId = null
    }

    return {
      supabase,
      user,
      tenantId,
      fullName: profile?.full_name?.trim() || null,
      role: profile?.role ?? null,
    }
  },
)