import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDashboardSession } from '@/lib/supabase/session'
import SuccessToast from '@/components/SuccessToast'
import { friendlyDbRedirect } from '@/lib/db-errors'
import SubmitButton from '@/components/SubmitButton'

const STREAM_ERR = {
  noSchool:    encodeURIComponent('Error|No school is linked to this account.'),
  missingArgs: encodeURIComponent('Error|Grade and stream name are required.'),
  invalidGrade:encodeURIComponent('Error|Invalid grade.'),
}

async function saveStream(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession(); if (!user) redirect('/login')
  if (!tenantId) redirect('/dashboard/streams?error=' + STREAM_ERR.noSchool)
  const p = { tenant_id: tenantId }
  const classId = String(formData.get('class_id') || ''); const name = String(formData.get('name') || '').trim()
  if (!classId || !name) redirect('/dashboard/streams?error=' + STREAM_ERR.missingArgs)
  const { data: cls } = await supabase.from('classes').select('id').eq('id', classId).eq('tenant_id', p.tenant_id).maybeSingle()
  if (!cls) redirect('/dashboard/streams?error=' + STREAM_ERR.invalidGrade)
  // Pre-check duplicate: (class_id, name) unique constraint
  const { data: existing } = await supabase.from('streams').select('id').eq('class_id', classId).ilike('name', name).maybeSingle()
  if (existing) redirect('/dashboard/streams?error=' + encodeURIComponent('Stream already exists|A stream with this name already exists in this grade. Please use a different name.'))
  const { error } = await supabase.from('streams').insert({ tenant_id: p.tenant_id, class_id: classId, name })
  if (error) redirect('/dashboard/streams?error=' + encodeURIComponent(friendlyDbRedirect(error)))
  revalidatePath('/dashboard/streams'); revalidatePath('/dashboard/students'); redirect('/dashboard/streams?saved=1')
}

async function deleteStream(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession(); if (!user) redirect('/login')
  const id = String(formData.get('id') || ''); if (!tenantId || !id) return
  // Learners are unstreamed, never deleted. Tolerant to stream_id migration not being applied yet.
  const unstream = await supabase.from('students').update({ stream_id: null }).eq('tenant_id', tenantId).eq('stream_id', id)
  if (unstream.error && unstream.error.code === '42703') { /* stream_id column not applied yet */ }
  await supabase.from('streams').delete().eq('id', id).eq('tenant_id', tenantId)
  revalidatePath('/dashboard/streams'); revalidatePath('/dashboard/students'); revalidatePath('/dashboard/results'); revalidatePath('/dashboard/analysis')
  redirect('/dashboard/streams?deleted=1')
}

async function getStreamCounts(supabase: Awaited<ReturnType<typeof getDashboardSession>>['supabase'], tenantId: string): Promise<Map<string, number>> {
  const rpc = await supabase
    .rpc('count_students_by_stream')
    .then((res) => res, (reason: unknown) => ({ data: null as { stream_id: string | null; learner_count: number }[] | null, error: reason }))
  if (!rpc.error && rpc.data) {
    const counts = new Map<string, number>()
    for (const row of rpc.data) if (row.stream_id) counts.set(row.stream_id, Number(row.learner_count ?? 0))
    return counts
  }
  const { data } = await supabase
    .from('students')
    .select('stream_id')
    .eq('tenant_id', tenantId)
    .then((res) => res, (reason: unknown) => ({ data: null as { stream_id: string | null }[] | null, error: reason }))
  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    if (row.stream_id) counts.set(row.stream_id, (counts.get(row.stream_id) ?? 0) + 1)
  }
  return counts
}

export default async function StreamsPage({ searchParams }: { searchParams: Promise<{ saved?: string; deleted?: string; error?: string }> }) {
  const params = await searchParams
  const { supabase, user, tenantId } = await getDashboardSession(); if (!user) return <main className="main"><p>Please sign in.</p></main>
  if (!tenantId) return <main className="main"><p>No school is linked.</p></main>
  const [{ data: classes }, { data: streams }, streamCounts] = await Promise.all([
    supabase.from('classes').select('id,name').eq('tenant_id', tenantId).order('name'),
    supabase.from('streams').select('id,name,class_id,created_at').eq('tenant_id', tenantId).order('name'),
    getStreamCounts(supabase, tenantId),
  ])
  const classNames = new Map((classes ?? []).map(c => [c.id, c.name]))
  const streamsByClass = new Map<string, typeof streams>()
  for (const s of streams ?? []) { const list = streamsByClass.get(s.class_id) ?? []; list.push(s); streamsByClass.set(s.class_id, list) }
  const hasStreams = (streams ?? []).length > 0
  return <main className="main" style={{ maxWidth: 1050, margin: '0 auto' }}><div className="top"><div><div className="eyebrow">Academic organisation</div><h1 className="title">Streams</h1><p className="muted">Groups within a grade. Learners assigned to a stream get a stream position and stream analysis.</p></div><Link className="btn secondary" href="/dashboard/students">Learners</Link></div>
    {params.error && (() => { const idx = params.error.indexOf('|'); return idx > -1 ? <div className="notice error"><span className="font-semibold">{params.error.slice(0, idx)}</span><span className="block text-xs opacity-80 mt-0.5">{params.error.slice(idx + 1)}</span></div> : <div className="notice error">{params.error}</div> })()}{params.saved && <SuccessToast message="Stream saved" />}{params.deleted && <SuccessToast message="Stream deleted" />}
    <section className="card"><h2>Add stream</h2><form action={saveStream} className="inline-form">
      <label className="field-label">Grade<select name="class_id" required defaultValue=""><option value="">Select grade</option>{(classes ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="field-label">Stream name<input name="name" placeholder="e.g. East" required /></label>
      <SubmitButton>Add stream</SubmitButton>
    </form></section>
    <section className="card" style={{ marginTop: 18 }}>
      {classes?.length ? classes.map(c => {
        const list = streamsByClass.get(c.id) ?? []
        return (
          <section key={c.id} style={{ marginBottom: 20 }}>
            <div className="section-heading" style={{ marginBottom: 8 }}><div><h2 style={{ fontSize: 15 }}>{c.name}</h2></div><div><span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: '#ecfdf5', color: '#047857' }}>{list.length} stream{list.length === 1 ? '' : 's'}</span></div></div>
            {list.length ? (
              <div className="table" style={{ marginTop: 6 }}>
                <div className="row header"><span>Stream</span><span>Learners</span><span>Created</span><span>Actions</span></div>
                {list.map(s => <div className="row" key={s.id}><span>{s.name}</span><span>{streamCounts.get(s.id) ?? 0}</span><span>{new Date(s.created_at).toLocaleDateString()}</span><span className="actions-inline"><form action={deleteStream}><input type="hidden" name="id" value={s.id}/><button className="danger">Delete</button></form></span></div>)}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>No streams in this grade yet.</p>
            )}
          </section>
        )
      }) : <p className="muted">Create a grade first, then add its streams.</p>}
      {hasStreams && <p className="muted" style={{ marginTop: 8 }}>Deleting a stream removes the stream link from its learners — learner records and marks are kept.</p>}
    </section>
  </main>
}