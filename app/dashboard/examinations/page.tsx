import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDashboardSession } from '@/lib/supabase/session'
import SuccessToast from '@/components/SuccessToast'
import EmptyState from '@/components/EmptyState'
import { ClipboardList } from 'lucide-react'

const ASSESSMENT_COMPONENTS = ['test_exam', 'mid_term', 'end_term'] as const

function assessmentLabel(component: string | null) {
  if (component === 'test_exam') return 'Test Exam'
  if (component === 'mid_term') return 'Mid Term'
  if (component === 'end_term') return 'End Term'
  return 'Unspecified'
}

async function createExam(formData: FormData) {
  'use server'

  const { supabase, user, tenantId } = await getDashboardSession()

  if (!user) redirect('/login')

  if (!tenantId) {
    redirect('/dashboard/examinations?error=No%20school%20is%20linked')
  }

  const name = String(formData.get('name') || '').trim()

  if (!name) {
    redirect('/dashboard/examinations?error=Examination%20name%20is%20required')
  }

  const term = String(formData.get('term') || '').trim() || null
  const academic_year = Number(formData.get('academic_year')) || null

  const rawComponent = String(
    formData.get('assessment_component') || ''
  ).trim()

  const assessment_component =
    rawComponent === '' ? null : rawComponent

  if (
    assessment_component !== null &&
    !ASSESSMENT_COMPONENTS.includes(
      assessment_component as typeof ASSESSMENT_COMPONENTS[number]
    )
  ) {
    redirect(
      '/dashboard/examinations?error=Invalid%20assessment%20component'
    )
  }

const { error } = await supabase
    .from('exams')
    .insert({
      tenant_id: tenantId,
      name,
      term,
      academic_year,
      assessment_component,
    })

  if (error) {
    redirect(
      `/dashboard/examinations?error=${encodeURIComponent(error.message)}`
    )
  }

  revalidatePath('/dashboard/examinations')
  revalidatePath('/dashboard/marks')
  revalidatePath('/dashboard/results')

  redirect('/dashboard/examinations?saved=1')
}

async function deleteExam(formData: FormData) {
  'use server'

  const { supabase, user, tenantId } = await getDashboardSession()

  if (!user) redirect('/login')

  const id = String(formData.get('id') || '')

  if (tenantId && id) {
    await supabase
      .from('exams')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)
  }

  revalidatePath('/dashboard/examinations')
  revalidatePath('/dashboard/marks')
  revalidatePath('/dashboard/results')

  redirect('/dashboard/examinations?deleted=1')
}

export default async function Examinations({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string
    deleted?: string
    error?: string
  }>
}) {
const params = await searchParams

  const { supabase, user, tenantId } = await getDashboardSession()

  if (!user) {
    return (
      <main className="main">
        <p>Please sign in.</p>
      </main>
    )
  }

  if (!tenantId) {
    return (
      <main className="main">
        <p>No school is linked.</p>
      </main>
    )
  }

  const { data: exams } = await supabase
    .from('exams')
    .select(
      'id,name,term,academic_year,assessment_component,status,created_at'
    )
.eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  return (
    <main
      className="main"
      style={{ maxWidth: 1100, margin: '0 auto' }}
    >
      <div className="top">
        <div>
          <div className="eyebrow">Assessment management</div>
          <h1 className="title">Assessments</h1>
          <p className="muted">
            Create examinations, then assign classes and learning areas
            to each.
          </p>
        </div>

        <Link
          className="btn secondary"
          href="/dashboard/examinations/assign"
        >
          Assign scope
        </Link>
      </div>

      {params.error && (
        <div className="notice error">{params.error}</div>
      )}

      {params.saved && (
        <SuccessToast message="Examination created" />
      )}

      {params.deleted && (
        <SuccessToast message="Examination deleted" />
      )}

      <div className="card">
        <h2>Create examination</h2>

<form action={createExam} className="formgrid">
          <label className="field-label">
            Examination name
            <input
              name="name"
              placeholder="e.g. End Term 2026"
              required
            />
          </label>

          <label className="field-label">
            Term
            <input
              name="term"
              placeholder="e.g. Term 1"
            />
          </label>

          <label className="field-label">
            Academic year
            <input
              name="academic_year"
              type="number"
              placeholder="e.g. 2026"
            />
          </label>

          <label className="field-label">
            Assessment type
            <select
              name="assessment_component"
              defaultValue=""
            >
              <option value="">
                Legacy / unspecified
              </option>

              <option value="test_exam">
                Test Exam
              </option>

              <option value="mid_term">
                Mid Term
              </option>

              <option value="end_term">
                End Term
              </option>
            </select>
          </label>

          <button className="btn">
            Create examination
          </button>
        </form>
      </div>

      <div
        className="card"
        style={{ marginTop: 20 }}
      >
        <h2>Examinations</h2>

{!exams?.length ? (
          <EmptyState
            icon={ClipboardList}
            title="No examinations yet"
            body="Create an examination above, then assign its grades and learning areas before recording marks."
          />
        ) : (
          <div className="table">
            {exams.map((e) => (
              <div
                className="row"
                key={e.id}
              >
                <div>
                  <strong>{e.name}</strong>

                  <div className="muted">
                    {e.term || 'No term'} ·{' '}
                    {e.academic_year || 'No year'} ·{' '}
                    {assessmentLabel(
                      e.assessment_component
                    )}{' '}
                    · {e.status}
                  </div>
                </div>

                <div
                  className="actions"
                  style={{ marginTop: 0 }}
                >
                  <Link
                    className="btn secondary"
                    href={`/dashboard/examinations/assign?exam=${e.id}`}
                  >
                    Assign scope
                  </Link>

                  <form action={deleteExam}>
                    <input
                      type="hidden"
                      name="id"
                      value={e.id}
                    />

                    <button className="danger">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
