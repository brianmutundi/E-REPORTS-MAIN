'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { checkString, checkEmail, checkPassword, checkId } from '@/lib/validation'
import { friendlyDbMessage } from '@/lib/db-errors'

async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required.')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') throw new Error('Super Admin access required.')
  return user
}

export async function createTenant(formData: FormData) {
  await requireSuperAdmin()
  const name = checkString(formData.get('name'), { label: 'School name', max: 150 })
  if (!name.ok) throw new Error(name.error)
  const admin = createAdminClient()
  const { error } = await admin.from('tenants').insert({ name: name.value, status: 'active' })
  if (error) throw new Error(friendlyDbMessage(error))
  revalidatePath('/super-admin/dashboard')
}

export async function toggleTenantStatus(tenantId: string, currentStatus: string) {
  await requireSuperAdmin()
  const id = checkId(tenantId, 'Tenant')
  if (!id.ok) throw new Error(id.error)
  const admin = createAdminClient()
  const { data: existing } = await admin.from('tenants').select('id,status').eq('id', id.value).maybeSingle()
  if (!existing) throw new Error('Tenant not found.')
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
  const { error } = await admin.from('tenants').update({ status: newStatus }).eq('id', id.value)
  if (error) throw new Error(friendlyDbMessage(error))
  revalidatePath('/super-admin/dashboard')
}

export async function deleteTenant(tenantId: string) {
  await requireSuperAdmin()
  const id = checkId(tenantId, 'Tenant')
  if (!id.ok) throw new Error(id.error)
  const admin = createAdminClient()
  const { data: existing } = await admin.from('tenants').select('id').eq('id', id.value).maybeSingle()
  if (!existing) throw new Error('Tenant not found.')
  const { data: admins } = await admin.from('profiles').select('id').eq('tenant_id', id.value).eq('role', 'admin')
  for (const a of admins ?? []) await admin.auth.admin.deleteUser(a.id)
  const { error } = await admin.from('tenants').delete().eq('id', id.value)
  if (error) throw new Error(friendlyDbMessage(error))
  revalidatePath('/super-admin/dashboard')
}

export async function createAdmin(formData: FormData) {
  await requireSuperAdmin()
  const fullName = checkString(formData.get('full_name'), { label: 'Full name', max: 150 })
  if (!fullName.ok) throw new Error(fullName.error)
  const email = checkEmail(formData.get('email'))
  if (!email.ok) throw new Error(email.error)
  const password = checkPassword(formData.get('password'))
  if (!password.ok) throw new Error(password.error)
  const tenantId = checkId(formData.get('tenant_id'), 'Tenant')
  if (!tenantId.ok) throw new Error(tenantId.error)
  const admin = createAdminClient()
  const { data: existing } = await admin.from('tenants').select('id').eq('id', tenantId.value).maybeSingle()
  if (!existing) throw new Error('The selected tenant does not exist.')
  const { data: authData, error: authError } = await admin.auth.admin.createUser({ email: email.value, password: password.value, email_confirm: true })
  if (authError || !authData.user) throw new Error(authError?.message || 'Could not create administrator account.')
  const { error: profileError } = await admin.from('profiles').insert({ id: authData.user.id, full_name: fullName.value, role: 'admin', tenant_id: tenantId.value })
  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id)
    throw new Error(friendlyDbMessage(profileError))
  }
  revalidatePath('/super-admin/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
