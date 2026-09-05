import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { getDashboardSession } from '@/lib/supabase/session'
import SubmitButton from '@/components/SubmitButton'

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

async function saveAssignments(formData: FormData) {
  'use server'
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return
  if (!tenantId) return
  const examId = String(formData.get('exam_id') || '')
  if (!examId) return
  const { data: exam } = await supabase.from('exams').select('id').eq('id', examId).eq('tenant_id', tenantId).single()
  if (!exam) return

  const classIds = Array.from(new Set(formData.getAll('class_id').map(String).filter(Boolean)))
  const subjectIdsByClass = new Map<string, string[]>()
  for (const classId of classIds) {
    const subjectIds = Array.from(new Set(formData.getAll(`subject_${classId}`).map(String).filter(Boolean)))
    if (subjectIds.length) subjectIdsByClass.set(classId, subjectIds)
  }

  // Defense in depth on top of RLS: grades and learning areas must belong
  // to this school before they are linked to the assessment.
  const allSubjectIds = Array.from(new Set([...subjectIdsByClass.values()].flat()))
  const [{ data: tenantClasses }, { data: tenantSubjects }] = await Promise.all([
    supabase.from('classes').select('id').eq('tenant_id', tenantId).in('id', classIds.length ? classIds : [EMPTY_UUID]),
    supabase.from('subjects').select('id').eq('tenant_id', tenantId).in('id', allSubjectIds.length ? allSubjectIds : [EMPTY_UUID]),
  ])
  const validClassIds = new Set((tenantClasses ?? []).map(c => c.id))
  const validSubjectIds = new Set((tenantSubjects ?? []).map(s => s.id))
  const safeClassIds = classIds.filter(cid => validClassIds.has(cid))
  const safeRows = safeClassIds.flatMap(cid => (subjectIdsByClass.get(cid) ?? []).filter(sid => validSubjectIds.has(sid)).map(subject_id => ({ exam_id: examId, class_id: cid, subject_id })))

  // Atomic scope replacement: one transaction deletes then re-inserts the
  // exam/grade and grade/learning-area links, so a concurrent or interrupted
  // save can never leave the assessment scope half-written.
  const { error: scopeError } = await supabase.rpc('set_exam_scope', {
    p_exam_id: examId,
    p_class_ids: safeClassIds,
    p_subject_rows: safeRows.length ? safeRows.map(r => ({ class_id: r.class_id, subject_id: r.subject_id })) : null,
  })

  if (scopeError) {
    if (scopeError.code !== 'PGRST202' && !/cannot find the function|does not exist/i.test(scopeError.message ?? '')) {
      return
    }
    // Pre-migration database: fall back to the previous multi-statement scope
    // replacement. A missing exam_class_subjects table is tolerated.
    await supabase.from('exam_classes').delete().eq('exam_id', examId)
    if (safeClassIds.length) {
      await supabase.from('exam_classes').insert(safeClassIds.map(class_id => ({ exam_id: examId, class_id })))
    }
    try {
      await supabase.from('exam_class_subjects').delete().eq('exam_id', examId)
    } catch {
      // Pre-migration databases have no exam_class_subjects table yet.
    }
    if (safeRows.length) {
      const { error } = await supabase.from('exam_class_subjects').insert(safeRows)
      if (error) return
    }
  }

  revalidatePath('/dashboard/examinations/assign')
  revalidatePath('/dashboard/examinations')
  revalidatePath('/dashboard/marks')
  revalidatePath('/dashboard/marks/import')
  revalidatePath('/dashboard/results')
  revalidatePath('/dashboard/reports')
  revalidatePath('/dashboard/analysis')
}

export default async function AssignPage({ searchParams }: { searchParams: Promise<{ exam?: string }> }) {
  const { exam: examId } = await searchParams
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) return <main className="main"><p>Please sign in.</p></main>
  if (!tenantId) return <main className="main"><p>No school is linked to this account.</p></main>

  const [{ data: exams }, { data: classes }, { data: subjects }] = await Promise.all([
    supabase.from('exams').select('id,name,term,academic_year').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabase.from('classes').select('id,name').eq('tenant_id', tenantId).order('name'),
    supabase.from('subjects').select('id,name,code').eq('tenant_id', tenantId).order('name'),
  ])

  const selectedClassIds = new Set<string>()
  const subjectsByClass = new Map<string, Set<string>>()

  if (examId) {
    const [{ data: sc }, { data: sl }] = await Promise.all([
      supabase.from('exam_classes').select('class_id').eq('exam_id', examId),
      supabase.from('exam_class_subjects').select('class_id,subject_id').eq('exam_id', examId).then((res) => res, (reason: unknown) => ({ data: null as null, error: reason })),
    ])
    for (const row of sc ?? []) selectedClassIds.add(row.class_id)
    for (const row of sl ?? []) {
      const set = subjectsByClass.get(row.class_id) ?? new Set<string>()
      set.add(row.subject_id)
      subjectsByClass.set(row.class_id, set)
    }
  }

  const allSubjects = subjects ?? []
  const checkedClasses = classes?.filter(c => selectedClassIds.has(c.id)) ?? []

  return (
    <main className="main" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="top">
        <div>
          <div className="eyebrow">Examination scope</div>
          <h1 className="title">Assign Grades & Learning Areas</h1>
          <p className="muted">
            Pick the grades that sit this assessment, then configure each grade&apos;s learning areas.
          </p>
        </div>
        <Link className="btn secondary" href="/dashboard/examinations">Back</Link>
      </div>

      <div className="card">
        <form method="get" className="formgrid">
          <select name="exam" defaultValue={examId ?? ''} required>
            <option value="">Choose examination</option>
            {(exams ?? []).map(e => <option key={e.id} value={e.id}>{e.name} · {e.term ?? ''}</option>)}
          </select>
          <button className="btn secondary">Load</button>
        </form>
      </div>

      {examId && (
        <form action={saveAssignments} className="card" style={{ marginTop: 20 }}>
          <input type="hidden" name="exam_id" value={examId} />

          <section>
            <h2>Grades assigned to this assessment</h2>
            {!(classes?.length) ? <p className="muted">Add grades first.</p> : (
              <div className="checklist">
                {classes.map(c => (
                  <label key={c.id}>
                    <input type="checkbox" name="class_id" value={c.id} defaultChecked={selectedClassIds.has(c.id)} />
                    {c.name}
                    {selectedClassIds.has(c.id) && (
                      <span className="muted" style={{ marginLeft: 8 }}>
                        ({subjectsByClass.get(c.id)?.size ?? 0} learning areas)
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </section>

          {checkedClasses.length > 0 && (
            <section style={{ marginTop: 20, borderTop: '1px solid var(--line, #e2e8f0)', paddingTop: 20 }}>
              <h2>Learning areas for each grade</h2>
              {!(allSubjects.length) ? <p className="muted">Add learning areas first.</p> : (
                checkedClasses.map(c => (
                  <div key={c.id} style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{c.name}</h3>
                    <div className="checklist">
                      {allSubjects.map(s => (
                        <label key={`${c.id}:${s.id}`}>
                          <input type="checkbox" name={`subject_${c.id}`} value={s.id} defaultChecked={subjectsByClass.get(c.id)?.has(s.id) ?? false} />
                          {s.name}{s.code ? ` (${s.code})` : ''}
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>
          )}

          <SubmitButton style={{ marginTop: 20 }}>Save examination scope</SubmitButton>
        </form>
      )}
    </main>
  )
}