import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { buildResultsImportPreview, commitResultsImport, type ResultsPreviewRow } from '@/lib/import/results'

export const runtime = 'nodejs'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB — results sheets can have many subject columns

async function getTenantId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { tenantId: null, userId: null }
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  return { tenantId: profile?.tenant_id ?? null, userId: user.id }
}

async function verifyContext(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, examId: string, classId: string) {
  const [{ data: exam }, { data: cls }, { data: scope }] = await Promise.all([
    supabase.from('exams').select('id').eq('id', examId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('classes').select('id').eq('id', classId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('exam_classes').select('exam_id').eq('exam_id', examId).eq('class_id', classId).maybeSingle(),
  ])
  return Boolean(exam && cls && scope)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { tenantId, userId } = await getTenantId(supabase)
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!tenantId) return NextResponse.json({ error: 'No school is linked to this account.' }, { status: 403 })

  const throttled = limitAuthenticatedRoute(request.headers, userId, 'import-results', 20)
  if (throttled) return throttled

  const form = await request.formData()
  const mode = String(form.get('mode') || 'preview')
  const examId = String(form.get('exam_id') || '')
  const classId = String(form.get('class_id') || '')
  if (!examId || !classId) return NextResponse.json({ error: 'Examination and class are required.' }, { status: 400 })

  const contextValid = await verifyContext(supabase, tenantId, examId, classId)
  if (!contextValid) return NextResponse.json({ error: 'This class is not assigned to the selected examination, or does not belong to your school.' }, { status: 403 })

  if (mode === 'commit') {
    const rowsRaw = String(form.get('rows') || '[]')
    const filename = String(form.get('filename') || '')
    let rows: ResultsPreviewRow[]
    try { rows = JSON.parse(rowsRaw) } catch { return NextResponse.json({ error: 'Invalid preview payload.' }, { status: 400 }) }

    const result = await commitResultsImport(supabase, tenantId, { examId, rows })

    await supabase.from('import_batches').insert({
      tenant_id: tenantId,
      kind: 'results',
      performed_by: userId,
      exam_id: examId,
      class_id: classId,
      filename: filename || null,
      total_rows: rows.length,
      created_count: result.created,
      updated_count: 0,
      skipped_count: result.skipped,
      failed_count: result.failed,
      status: result.errors.length ? 'rejected' : 'completed',
      error_report: result.errors,
    })

    revalidatePath('/dashboard/marks')
    revalidatePath('/dashboard/results')
    revalidatePath('/dashboard/reports')
    return NextResponse.json(result)
  }

  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'A CSV file is required.' }, { status: 400 })
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'File is too large.' }, { status: 400 })
  if (!/\.(csv|txt)$/i.test(file.name)) return NextResponse.json({ error: 'Only .csv files are supported.' }, { status: 400 })

  const csvText = await file.text()
  const preview = await buildResultsImportPreview(supabase, tenantId, { examId, classId, csvText })
  return NextResponse.json(preview)
}
