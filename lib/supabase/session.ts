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

    return {
      supabase,
      user,
      tenantId: profile?.tenant_id ?? null,
      fullName: profile?.full_name?.trim() || null,
      role: profile?.role ?? null,
    }
  },
)