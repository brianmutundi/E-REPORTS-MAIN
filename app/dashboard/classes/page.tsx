import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDashboardSession } from '@/lib/supabase/session'
import SuccessToast from '@/components/SuccessToast'

async function saveClass(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession(); if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/classes?error=No%20school%20is%20linked')
  const id = String(formData.get('id') || ''); const name = String(formData.get('name') || '').trim(); if (!name) redirect('/dashboard/classes?error=Class%20name%20is%20required')
  const teacherName = String(formData.get('teacher_name') || '').trim() || null
  const principalName = String(formData.get('principal_name') || '').trim() || null
  const attemptFull = () => id ? supabase.from('classes').update({ name, teacher_name: teacherName, principal_name: principalName }).eq('id', id).eq('tenant_id', tenantId) : supabase.from('classes').insert({ name, teacher_name: teacherName, principal_name: principalName, tenant_id: tenantId })
  const attemptTeachers = () => id ? supabase.from('classes').update({ name, teacher_name: teacherName }).eq('id', id).eq('tenant_id', tenantId) : supabase.from('classes').insert({ name, teacher_name: teacherName, tenant_id: tenantId })
  const attemptBase = () => id ? supabase.from('classes').update({ name }).eq('id', id).eq('tenant_id', tenantId) : supabase.from('classes').insert({ name, tenant_id: tenantId })
  let result = await attemptFull()
  if (result.error) result = await attemptTeachers()
  if (result.error) result = await attemptBase()
  if (result.error) redirect(`/dashboard/classes?error=${encodeURIComponent(result.error.message)}`)
  revalidatePath('/dashboard/classes'); revalidatePath('/dashboard/marks'); revalidatePath('/dashboard/results'); redirect('/dashboard/classes?saved=1')
}
async function deleteClass(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession(); if (!user) redirect('/login')
  const id = String(formData.get('id') || '')
  if (tenantId && id) await supabase.from('classes').delete().eq('id', id).eq('tenant_id', tenantId)
  revalidatePath('/dashboard/classes'); revalidatePath('/dashboard/marks'); redirect('/dashboard/classes?deleted=1')
}
export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ edit?: string; saved?: string; deleted?: string; error?: string }> }) {
  const params = await searchParams; const { supabase, user, tenantId } = await getDashboardSession(); if (!user) return <main className="main"><p>Please sign in.</p></main>
  if (!tenantId) return <main className="main"><p>No school is linked.</p></main>
  let { data: classes } = await supabase.from('classes').select('id,name,teacher_name,principal_name,created_at').eq('tenant_id', tenantId).order('name')
  if (classes === null) { const r = await supabase.from('classes').select('id,name,created_at').eq('tenant_id', tenantId).order('name'); classes = r.data as any }
  const editing = classes?.find(c => c.id === params.edit)
  return <main className="main" style={{ maxWidth: 1050, margin: '0 auto' }}><div className="top"><div><div className="eyebrow">Academic setup</div><h1 className="title">Classes</h1><p className="muted">Manage the classes used for examination reports.</p></div><Link className="btn secondary" href="/dashboard/students">Students</Link></div>
    {params.error && <div className="notice error">{params.error}</div>}{params.saved && <SuccessToast message="Class saved" />}{params.deleted && <SuccessToast message="Class deleted" />}
    <section className="card"><h2>{editing ? 'Edit class' : 'Add class'}</h2><form action={saveClass} className="inline-form">{editing && <input type="hidden" name="id" value={editing.id}/>}<label className="field-label">Class name<input name="name" placeholder="e.g. Grade 6" defaultValue={editing?.name ?? ''} required /></label><label className="field-label">Class teacher&apos;s name<input name="teacher_name" placeholder="Class teacher&apos;s name" defaultValue={(editing && 'teacher_name' in editing) ? (editing as any).teacher_name ?? '' : ''} /></label><label className="field-label">Principal&apos;s name<input name="principal_name" placeholder="Principal&apos;s name" defaultValue={(editing && 'principal_name' in editing) ? (editing as any).principal_name ?? '' : ''} /></label><button className="btn">{editing ? 'Update class' : 'Add class'}</button>{editing && <Link className="btn secondary" href="/dashboard/classes">Cancel</Link>}</form></section>
<section className="card" style={{ marginTop: 18 }}><div className="table table-5col"><div className="row header"><span>Class</span><span>Class Teacher</span><span>Principal</span><span>Created</span><span>Actions</span></div>{classes?.length ? classes.map(c => <div className="row" key={c.id}><span>{c.name}</span><span>{(c as any).teacher_name ?? '—'}</span><span>{(c as any).principal_name ?? '—'}</span><span>{new Date(c.created_at).toLocaleDateString()}</span><span className="actions-inline"><Link className="btn secondary" href={`/dashboard/classes?edit=${c.id}`}>Edit</Link><form action={deleteClass}><input type="hidden" name="id" value={c.id}/><button className="danger">Delete</button></form></span></div>) : <p className="muted">No classes yet.</p>}</div></section>
  </main>
}