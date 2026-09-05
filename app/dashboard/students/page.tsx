import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Download, FileSpreadsheet, FileText, Upload, Users, UserPlus, ChevronRight, GraduationCap, Pencil, Trash2 } from 'lucide-react'
import SuccessToast from '@/components/SuccessToast'
import { toTitleCase } from '@/lib/format-name'
import { getDashboardSession } from '@/lib/supabase/session'
import ClassSwitcher from '@/components/ClassSwitcher'
import { friendlyDbMessage } from '@/lib/db-errors'
import SubmitButton from '@/components/SubmitButton'

async function getTenantContext() {
  const { supabase, user, tenantId } = await getDashboardSession()

  if (!user) redirect('/login')

  if (!tenantId) redirect('/dashboard/students?error=No%20school%20is%20linked')

  return { supabase, tenantId }
}

/** Per-class learner counts, aggregated server-side. Falls back to the old
 * full-table scan when the aggregate functions are not yet applied. */
async function getClassCounts(supabase: Awaited<ReturnType<typeof getDashboardSession>>['supabase'], tenantId: string): Promise<Map<string, number>> {
  const rpc = await supabase
    .rpc('count_students_by_class')
    .then((res) => res, (reason: unknown) => ({ data: null as { class_id: string | null; learner_count: number }[] | null, error: reason }))
  if (!rpc.error && rpc.data) {
    const counts = new Map<string, number>()
    for (const row of rpc.data) if (row.class_id) counts.set(row.class_id, Number(row.learner_count ?? 0))
    return counts
  }
  const { data } = await supabase
    .from('students')
    .select('class_id')
    .eq('tenant_id', tenantId)
    .then((res) => res, (reason: unknown) => ({ data: null as { class_id: string | null }[] | null, error: reason }))
  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    if (row.class_id) counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1)
  }
  return counts
}

function getStudentWriteErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return 'The student could not be saved.'
  // Centralized mapping: handles 23505 (duplicate admission), 23503 (FK), etc.
  // without exposing raw Postgres details.
  const msg = friendlyDbMessage(error)
  if (msg !== 'An unexpected error occurred. Please try again.') return msg
  if (error.code === '23503') return 'The selected grade is no longer available.'
  return 'The student could not be saved. Please try again.'
}

async function saveStudent(formData: FormData) {
  'use server'

  const { supabase, tenantId } = await getTenantContext()
  const id = String(formData.get('id') || '')
  const admissionNo = String(formData.get('admission_no') || '').trim()
  const fullName = toTitleCase(String(formData.get('full_name') || '').trim())
  const selectedClassId = String(formData.get('selected_class_id') || '').trim()
  const editClassId = String(formData.get('class_id') || '').trim()
  const streamIdRaw = String(formData.get('stream_id') || '').trim()

  if (!admissionNo || !fullName) {
    redirect(
      `/dashboard/students${
        selectedClassId ? `?class_id=${encodeURIComponent(selectedClassId)}&` : '?'
      }error=Admission%20number%20and%20student%20name%20are%20required`,
    )
  }

  let classId = selectedClassId || null

  if (id) {
    const { data: existing } = await supabase
      .from('students')
      .select('id,class_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!existing) redirect('/dashboard/students?error=Student%20not%20found')

    // Editing preserves the existing class unless the user intentionally changes it.
    classId = editClassId || existing.class_id || null
  }

  if (!classId) {
    redirect(
      `/dashboard/students?error=${encodeURIComponent(
        id ? 'A student grade is required.' : 'Select a grade before adding a student.',
      )}`,
    )
  }

  const safeClassId = classId as string

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', safeClassId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!cls) redirect('/dashboard/students?error=Invalid%20grade')

  let streamId: string | null = null
  if (streamIdRaw) {
    const { data: stream } = await supabase
      .from('streams')
      .select('id,class_id')
      .eq('id', streamIdRaw)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!stream) redirect('/dashboard/students?error=Invalid%20stream')
    if (stream.class_id !== safeClassId) {
      redirect(`/dashboard/students?class_id=${encodeURIComponent(safeClassId)}&error=${encodeURIComponent('That stream does not belong to the selected grade.')}`)
    }
    streamId = stream.id
  }

  const { data: duplicateStudent } = await supabase
    .from('students')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('admission_no', admissionNo)
    .neq('id', id || '00000000-0000-0000-0000-000000000000')
    .maybeSingle()

  if (duplicateStudent) {
    redirect(
      `/dashboard/students?class_id=${encodeURIComponent(safeClassId)}&error=${encodeURIComponent(
        'Learner already exists|A learner with this admission number is already registered in this school.',
      )}`,
    )
  }

  const payload = { admission_no: admissionNo, full_name: fullName, class_id: safeClassId }
  const streamPayload = streamId ? { ...payload, stream_id: streamId } : payload

  let result = id
    ? await supabase.from('students').update(streamPayload).eq('id', id).eq('tenant_id', tenantId)
    : await supabase.from('students').insert({ ...streamPayload, tenant_id: tenantId })

  // Tolerant fallback: if the live schema lacks stream_id (migration not yet applied),
  // retry the save without it rather than blocking the learner record.
  if (result.error && (result.error.code === '42703' || result.error.message?.toLowerCase().includes('stream_id'))) {
    result = id
      ? await supabase.from('students').update(payload).eq('id', id).eq('tenant_id', tenantId)
      : await supabase.from('students').insert({ ...payload, tenant_id: tenantId })
  }

  if (result.error) {
    redirect(
      `/dashboard/students?class_id=${encodeURIComponent(safeClassId)}&error=${encodeURIComponent(
        getStudentWriteErrorMessage(result.error),
      )}`,
    )
  }

  revalidatePath('/dashboard/students')
  revalidatePath('/dashboard/marks')
  revalidatePath('/dashboard/results')
  redirect(`/dashboard/students?class_id=${encodeURIComponent(safeClassId)}&saved=1`)
}

async function deleteStudent(formData: FormData) {
  'use server'

  const { supabase, tenantId } = await getTenantContext()
  const id = String(formData.get('id') || '').trim()

  if (!id) redirect('/dashboard/students?error=Invalid%20student')

  const { data: student } = await supabase
    .from('students')
    .select('id,class_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!student) redirect('/dashboard/students?error=Student%20not%20found')

  // The current schema has marks as the only direct student-dependent record.
  // Do not allow a student delete to cascade-delete historical marks.
  const { count: marksCount, error: marksError } = await supabase
    .from('marks')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('student_id', id)

  if (marksError) {
    redirect('/dashboard/students?error=Could%20not%20verify%20student%20dependencies')
  }

  if ((marksCount ?? 0) > 0) {
    const classQuery = student.class_id ? `?class_id=${encodeURIComponent(student.class_id)}&` : '?'
    redirect(
      `/dashboard/students${classQuery}error=${encodeURIComponent(
        'This student cannot be deleted because historical marks are linked to the student.',
      )}`,
    )
  }

  const { error: deleteError } = await supabase
    .from('students')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (deleteError) {
    const message =
      deleteError.code === '23503'
        ? 'This student cannot be deleted because dependent records exist.'
        : 'The student could not be deleted. Please try again.'
    const classQuery = student.class_id ? `?class_id=${encodeURIComponent(student.class_id)}&` : '?'
    redirect(`/dashboard/students${classQuery}error=${encodeURIComponent(message)}`)
  }

  revalidatePath('/dashboard/students')
  revalidatePath('/dashboard/marks')
  revalidatePath('/dashboard/results')

  const classQuery = student.class_id ? `?class_id=${encodeURIComponent(student.class_id)}&` : '?'
  redirect(`/dashboard/students${classQuery}deleted=1`)
}

type SearchParams = {
  class_id?: string
  edit?: string
  saved?: string
  deleted?: string
  error?: string
}

type ClassRow = {
  id: string
  name: string
}

type StudentRow = {
  id: string
  admission_no: string
  full_name: string
  class_id: string | null
  stream_id?: string | null
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const { supabase, tenantId } = await getTenantContext()

  const [{ data: classes }, classCounts, { data: streamRows }] = await Promise.all([
    supabase.from('classes').select('id,name').eq('tenant_id', tenantId).order('name'),
    getClassCounts(supabase, tenantId),
    supabase.from('streams').select('id,name,class_id').eq('tenant_id', tenantId).order('name'),
  ])
  const counts = classCounts

  const streamsByClass = new Map<string, { id: string; name: string }[]>()
  for (const stream of streamRows ?? []) {
    const list = streamsByClass.get(stream.class_id) ?? []
    list.push({ id: stream.id, name: stream.name })
    streamsByClass.set(stream.class_id, list)
  }

  const selectedClassId =
    params.class_id && classes?.some((c: ClassRow) => c.id === params.class_id) ? params.class_id : null
  const selectedClass = classes?.find((c: ClassRow) => c.id === selectedClassId) ?? null
  const classStreams = selectedClassId ? (streamsByClass.get(selectedClassId) ?? []) : []
  const streamNameById = new Map(classStreams.map(s => [s.id, s.name]))

  const { data: students } = selectedClassId
    ? await supabase
        .from('students')
        .select('id,admission_no,full_name,class_id,stream_id')
        .eq('tenant_id', tenantId)
        .eq('class_id', selectedClassId)
        .order('full_name')
    : { data: [] as StudentRow[] }

  const roster = (students ?? []) as StudentRow[]
  const editing =
    params.edit && selectedClassId ? roster.find((student) => student.id === params.edit) ?? null : null

  return (
    <main className="main mx-auto w-full max-w-7xl min-w-0">
      {/* Page heading and mobile-friendly actions */}
      <div className="top">
        <div className="min-w-0">
          <div className="eyebrow">Student management</div>
          <h1 className="title">Students</h1>
          <p className="muted max-w-2xl">
            Select a grade to manage its roster, import students, or export the grade list.
          </p>
        </div>


      </div>

      {params.error && (() => { const idx = params.error.indexOf('|'); return idx > -1 ? <div className="notice error"><span className="font-semibold">{params.error.slice(0, idx)}</span><span className="block text-xs opacity-80 mt-0.5">{params.error.slice(idx + 1)}</span></div> : <div className="notice error">{params.error}</div> })()}
      {params.saved && <SuccessToast message="Student saved" />}
      {params.deleted && <div className="notice success">Student deleted.</div>}

      {/* Class overview: compact cards on phones, richer grid on larger screens */}
      <section className="card overflow-hidden">
        <div className="section-heading mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Grade overview</h2>
                <p className="muted mt-0.5">Current student counts</p>
              </div>
            </div>
          </div>
        </div>

        {classes?.length ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((c: ClassRow) => {
              const isSelected = selectedClassId === c.id
              const count = counts.get(c.id) ?? 0

              return (
                <Link
                  key={c.id}
                  href={`/dashboard/students?class_id=${encodeURIComponent(c.id)}`}
                  className={`group flex min-h-16 items-center gap-3 rounded-xl border p-3 transition-all active:scale-[0.99] ${
                    isSelected
                      ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                      : 'border-slate-200 bg-slate-50 hover:border-emerald-200 hover:bg-emerald-50/50'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                      isSelected ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                    }`}
                  >
                    {count}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{c.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{count === 1 ? 'Student' : 'Students'}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="muted">No grades have been created yet.</p>
        )}
      </section>

      {/* Class selector — collapses to a compact switcher once a class is selected */}
      {selectedClass ? (
        <section className="card mt-4 overflow-hidden">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="class_id_switch" className="shrink-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              Switch grade
            </label>
            <ClassSwitcher
              classes={(classes ?? []).map((c: ClassRow) => ({ id: c.id, name: c.name }))}
              counts={Object.fromEntries(counts)}
              selectedClassId={selectedClassId ?? null}
            />
          </div>
        </section>
      ) : (
        <section className="card mt-4 overflow-hidden">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-slate-900">Choose a grade</h2>
              <p className="mt-0.5 text-xs text-slate-500">Only the selected grade roster will be displayed.</p>
            </div>
          </div>

          <form method="get" className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select
              name="class_id"
              defaultValue={selectedClassId ?? ''}
              className="block min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Select a grade</option>
              {(classes ?? []).map((c: ClassRow) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {counts.get(c.id) ?? 0} students
                </option>
              ))}
            </select>
            <button className="student-btn w-full sm:w-auto sm:px-6" type="submit">
              Open grade
            </button>
          </form>
        </section>
      )}

      {selectedClass ? (
        <>
          {/* Selected class toolbar */}
          <section className="card mt-4 overflow-hidden">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="eyebrow">Selected grade</div>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <h2 className="min-w-0 truncate text-xl font-bold text-slate-900">{selectedClass.name}</h2>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    {roster.length}
                  </span>
                </div>
                <p className="muted mt-1">{roster.length === 1 ? '1 student' : `${roster.length} students`}</p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end">
                <Link
                  className="student-btn w-full sm:w-auto"
                  href={`/dashboard/students?class_id=${encodeURIComponent(selectedClass.id)}&edit=new`}
                >
                  <UserPlus className="h-4 w-4" />
                  Add student
                </Link>
                <Link
                  className="student-btn secondary w-full sm:w-auto"
                  href={`/dashboard/students/import?class_id=${encodeURIComponent(selectedClass.id)}`}
                >
                  <Upload className="h-4 w-4" />
                  Bulk import
                </Link>
                <a
                  className="student-btn secondary w-full sm:w-auto"
                  href={`/api/students/export/xlsx?class_id=${encodeURIComponent(selectedClass.id)}`}
                  download
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export Excel
                </a>
                <a
                  className="student-btn secondary w-full sm:w-auto"
                  href={`/api/students/export/pdf?class_id=${encodeURIComponent(selectedClass.id)}`}
                  download
                >
                  <FileText className="h-4 w-4" />
                  Export PDF
                </a>
              </div>
            </div>
          </section>

          {/* Add / edit */}
          {params.edit === 'new' ? (
            <section className="card mt-4 overflow-hidden">
              <div className="mb-4">
                <div className="eyebrow">Add student</div>
                <h2 className="mt-1 text-base font-bold text-slate-900">Add student to {selectedClass.name}</h2>
                <p className="muted mt-1">The selected grade is assigned automatically.</p>
              </div>

              <form action={saveStudent} className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.5fr_auto] lg:items-end">
                <input type="hidden" name="selected_class_id" value={selectedClass.id} />
                <label className="field-label">
                  Admission number
                  <input name="admission_no" placeholder="e.g. ADM001" required />
                </label>
                <label className="field-label">
                  Full name
                  <input name="full_name" placeholder="Student full name" required />
                </label>
                {classStreams.length > 0 && (
                  <label className="field-label">
                    Stream
                    <select name="stream_id" defaultValue="">
                      <option value="">No stream</option>
                      {classStreams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}
                <SubmitButton className="student-btn w-full lg:w-auto">Add student</SubmitButton>
              </form>
            </section>
          ) : editing ? (
            <section className="card mt-4 overflow-hidden">
              <div className="mb-4">
                <div className="eyebrow">Edit student</div>
                <h2 className="mt-1 text-base font-bold text-slate-900">Update student details</h2>
                <p className="muted mt-1">The current grade is preserved unless you intentionally choose another grade.</p>
              </div>

              <form action={saveStudent} className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.5fr_1fr_1fr_auto_auto] lg:items-end">
                <input type="hidden" name="id" value={editing.id} />
                <input type="hidden" name="selected_class_id" value={selectedClass.id} />
                <label className="field-label">
                  Admission number
                  <input name="admission_no" placeholder="Admission number" defaultValue={editing.admission_no} required />
                </label>
                <label className="field-label">
                  Full name
                  <input name="full_name" placeholder="Full name" defaultValue={editing.full_name} required />
                </label>
                <label className="field-label">
                  Grade
                  <select name="class_id" defaultValue={editing.class_id ?? selectedClass.id}>
                    {(classes ?? []).map((c: ClassRow) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                {classStreams.length > 0 && (
                  <label className="field-label">
                    Stream
                    <select name="stream_id" defaultValue={editing.stream_id ?? ''}>
                      <option value="">No stream</option>
                      {classStreams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}
                <SubmitButton className="student-btn w-full lg:w-auto">Update</SubmitButton>
                <Link className="student-btn secondary w-full lg:w-auto" href={`/dashboard/students?class_id=${encodeURIComponent(selectedClass.id)}`}>
                  Cancel
                </Link>
              </form>
            </section>
          ) : null}

          {/* Roster */}
          <section className="card mt-4 overflow-hidden">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-slate-900">{selectedClass.name} roster</h2>
                <p className="muted mt-0.5">Admission number, name and actions</p>
              </div>
              <div className="hidden shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 md:block">
                {roster.length} {roster.length === 1 ? 'student' : 'students'}
              </div>
            </div>

            {roster.length ? (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-hidden rounded-xl border border-slate-200 md:block">
                  <div className="max-h-[60vh]">
                    <table className="w-full text-left text-sm text-slate-700">
                      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Admission No.</th>
                        <th className="px-4 py-3">Name</th>
                        {classStreams.length > 0 && <th className="px-4 py-3">Stream</th>}
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {roster.map((student) => (
                        <tr key={student.id} className="transition-colors hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-semibold text-slate-700">{student.admission_no}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{student.full_name}</td>
                          {classStreams.length > 0 && (
                            <td className="px-4 py-3">
                              {student.stream_id ? (
                                <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-0.5 text-xs font-semibold">
                                  {streamNameById.get(student.stream_id) ?? 'Stream'}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="actions-inline justify-end">
                              <Link
                                aria-label={`Edit ${student.full_name}`}
                                className="student-btn secondary"
                                href={`/dashboard/students?class_id=${encodeURIComponent(selectedClass.id)}&edit=${encodeURIComponent(student.id)}`}
                              >
                                <Pencil className="h-4 w-4" />
                                Edit
                              </Link>
                              <form action={deleteStudent}>
                                <input type="hidden" name="id" value={student.id} />
                                <input type="hidden" name="class_id" value={selectedClass.id} />
                                <button className="danger" type="submit" aria-label={`Delete ${student.full_name}`}><Trash2 className="h-4 w-4" />Delete</button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>

                {/* Phone cards */}
                <div className="grid grid-cols-1 gap-2.5 md:hidden">
                  {roster.map((student) => (
                    <article
                      key={student.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 shadow-sm"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-bold text-emerald-700">
                          {student.full_name.trim().charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-bold text-slate-900">{student.full_name}</h3>
                          <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{student.admission_no}</p>
                        </div>
                        <span className="max-w-[34%] shrink-0 truncate rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200" title={selectedClass.name}>
                          {student.stream_id && classStreams.length > 0 ? (streamNameById.get(student.stream_id) ?? selectedClass.name) : selectedClass.name}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                        <Link
                          aria-label={`Edit ${student.full_name}`}
                          className="student-btn secondary min-h-10 w-full"
                          href={`/dashboard/students?class_id=${encodeURIComponent(selectedClass.id)}&edit=${encodeURIComponent(student.id)}`}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Link>
                        <form action={deleteStudent} className="w-full">
                          <input type="hidden" name="id" value={student.id} />
                          <input type="hidden" name="class_id" value={selectedClass.id} />
                          <button className="danger min-h-10 w-full" type="submit" aria-label={`Delete ${student.full_name}`}><Trash2 className="h-4 w-4" />Delete</button>
                        </form>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-400 ring-1 ring-slate-200">
                  <Users className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-700">No students in {selectedClass.name} yet.</p>
                <p className="mt-1 text-xs text-slate-500">Add a student or use Bulk import to populate this grade.</p>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="card mt-4 overflow-hidden text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Download className="h-5 w-5" />
          </div>
          <h2 className="mt-3 text-base font-bold text-slate-900">Select a grade to continue</h2>
          <p className="muted mx-auto mt-1 max-w-md">
            Choose a grade above to view its roster. Add, import, and export actions stay scoped to the selected grade.
          </p>
        </section>
      )}
    </main>
  )
}

