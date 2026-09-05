'use server'

import { revalidatePath } from 'next/cache'
import { getDashboardSession } from '@/lib/supabase/session'
import { friendlyDbMessage } from '@/lib/db-errors'

export async function uploadSchoolLogo(logoUrl: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return { ok: false, error: 'Not signed in' }
  if (!tenantId) return { ok: false, error: 'No school linked' }

  // The report PDFs fetch the logo server-side, so only permit https URLs on
  // this project's own Supabase storage host. Any other host would be fetched
  // by the server during report generation (SSRF surface).
  let parsed: URL
  try {
    parsed = new URL(logoUrl)
  } catch {
    return { ok: false, error: 'Invalid logo URL.' }
  }
  const storageHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null
  if (parsed.protocol !== 'https:' || !parsed.hostname || !storageHost || parsed.hostname !== storageHost) {
    return { ok: false, error: 'Logo must be uploaded to your school storage bucket.' }
  }

  const { error } = await supabase.from('tenants').update({ logo_url: logoUrl }).eq('id', tenantId)
  if (error) return { ok: false, error: friendlyDbMessage(error) }
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/reports')
  return { ok: true }
}

export async function changePassword(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await getDashboardSession()
  if (!user) return { ok: false, error: 'Not signed in' }
  const current = String(formData.get('current_password') || '')
  const next = String(formData.get('new_password') || '')
  const confirm = String(formData.get('confirm_password') || '')

  if (!current || !next || !confirm) return { ok: false, error: 'All password fields are required.' }
  if (next.length < 8) return { ok: false, error: 'New password must be at least 8 characters.' }
  if (next !== confirm) return { ok: false, error: 'New password and confirmation do not match.' }

  const { error: signIn } = await supabase.auth.signInWithPassword({
    email: user.email || '',
    password: current,
  })
  if (signIn) return { ok: false, error: 'Current password is incorrect.' }

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) return { ok: false, error: friendlyDbMessage(error) }
  return { ok: true }
}
