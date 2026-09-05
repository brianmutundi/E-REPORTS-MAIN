import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDashboardSession } from '@/lib/supabase/session'
import SuccessToast from '@/components/SuccessToast'
import { friendlyDbRedirect } from '@/lib/db-errors'
import SubmitButton from '@/components/SubmitButton'

const SUBJ_ERR = {
  noSchool:     encodeURIComponent('Error|No school is linked to this account.'),
  emptyName:    encodeURIComponent('Error|Learning area name is required.'),
  duplicate:    encodeURIComponent('Learning area already exists|A learning area with this name is already registered in this school. Please use a different name.'),
  saveFailed:   encodeURIComponent('Error|The learning area could not be saved. Please try again.'),
}

async function saveSubject(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession(); if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/subjects?error=' + SUBJ_ERR.noSchool)
  const id = String(formData.get('id') || ''); const name = String(formData.get('name') || '').trim(); const code = String(formData.get('code') || '').trim() || null
  if (!name) redirect('/dashboard/subjects?error=' + SUBJ_ERR.emptyName)
  // Pre-check: catch duplicate before insert to give instant feedback.
  // The database unique constraint (tenant_id, name) remains the final guard.
  if (!id) {
    const { data: existing } = await supabase
      .from('subjects').select('id').eq('tenant_id', tenantId).ilike('name', name).maybeSingle()
    if (existing) redirect('/dashboard/subjects?error=' + SUBJ_ERR.duplicate)
  }
  const result = id ? await supabase.from('subjects').update({ name, code }).eq('id', id).eq('tenant_id', tenantId) : await supabase.from('subjects').insert({ name, code, tenant_id: tenantId })
  if (result.error) redirect('/dashboard/subjects?error=' + encodeURIComponent(friendlyDbRedirect(result.error)))
  revalidatePath('/dashboard/subjects'); revalidatePath('/dashboard/marks'); revalidatePath('/dashboard/results'); redirect('/dashboard/subjects?saved=1')
}
async function deleteSubject(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession(); if (!user) redirect('/login')
  const id = String(formData.get('id') || '')
  if (tenantId && id) await supabase.from('subjects').delete().eq('id', id).eq('tenant_id', tenantId)
  revalidatePath('/dashboard/subjects'); revalidatePath('/dashboard/marks'); redirect('/dashboard/subjects?deleted=1')
}
export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ edit?: string; saved?: string; deleted?: string; error?: string }> }) {
  const params = await searchParams; const { supabase, user, tenantId } = await getDashboardSession(); if (!user) return <main className="main"><p>Please sign in.</p></main>
  if (!tenantId) return <main className="main"><p>No school is linked.</p></main>
  const { data: subjects } = await supabase.from('subjects').select('id,name,code,created_at').eq('tenant_id', tenantId).order('name'); const editing = subjects?.find(s => s.id === params.edit)
  return <main className="main" style={{ maxWidth: 1050, margin: '0 auto' }}><div className="top"><div><div className="eyebrow">Academic setup</div><h1 className="title">Learning Areas</h1><p className="muted">Manage the learning areas used in examinations.</p></div><Link className="btn secondary" href="/dashboard/classes">Grades</Link></div>
    {params.error && (() => { const idx = params.error.indexOf('|'); return idx > -1 ? <div className="notice error"><span className="font-semibold">{params.error.slice(0, idx)}</span><span className="block text-xs opacity-80 mt-0.5">{params.error.slice(idx + 1)}</span></div> : <div className="notice error">{params.error}</div> })()}{params.saved && <SuccessToast message="Learning area saved" />}{params.deleted && <SuccessToast message="Learning area deleted" />}
    <section className="card"><h2>{editing ? 'Edit learning area' : 'Add learning area'}</h2><form action={saveSubject} className="inline-form">{editing && <input type="hidden" name="id" value={editing.id}/>}<label className="field-label">Learning area name<input name="name" placeholder="e.g. Mathematics" defaultValue={editing?.name ?? ''} required /></label><label className="field-label">Code (optional)<input name="code" placeholder="e.g. MAT" defaultValue={editing?.code ?? ''} /></label><SubmitButton>{editing ? 'Update' : 'Add'}</SubmitButton>{editing && <Link className="btn secondary" href="/dashboard/subjects">Cancel</Link>}</form></section>
    <section className="card" style={{ marginTop: 18 }}><div className="table table-3col"><div className="row header"><span>Learning area</span><span>Code</span><span>Actions</span></div>{subjects?.length ? subjects.map(s => <div className="row" key={s.id}><span>{s.name}</span><span>{s.code || '—'}</span><span className="actions-inline"><Link className="btn secondary" href={`/dashboard/subjects?edit=${s.id}`}>Edit</Link><form action={deleteSubject}><input type="hidden" name="id" value={s.id}/><button className="danger">Delete</button></form></span></div>) : <p className="muted">No learning areas yet. Add the learning areas taught at this school, then assign them to an assessment.</p>}</div></section>
  </main>
}
