import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { buildStudentImportPreview, commitStudentImport, type StudentPreviewRow } from '@/lib/import/students'

export const runtime = 'nodejs'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_COMMIT_ROWS = 10_000

type TenantContext = {
  tenantId: string | null
  userId: string | null
}

async function getTenantContext(supabase: Awaited<ReturnType<typeof createClient>>): Promise<TenantContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { tenantId: null, userId: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle()

  return { tenantId: profile?.tenant_id ?? null, userId: user.id }
}

async function verifyClass(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  classId: string,
) {
  return supabase
    .from('classes')
    .select('id,name')
    .eq('id', classId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { tenantId, userId } = await getTenantContext(supabase)

  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!tenantId) return NextResponse.json({ error: 'No school is linked to this account.' }, { status: 403 })

  const throttled = limitAuthenticatedRoute(request.headers, userId, 'import-students', 20)
  if (throttled) return throttled

  const form = await request.formData()
  const mode = String(form.get('mode') || 'preview').trim().toLowerCase()
  const classId = String(form.get('class_id') || '').trim()

  if (!classId) {
    return NextResponse.json({ error: 'A class must be selected before importing students.' }, { status: 400 })
  }

  if (mode !== 'preview' && mode !== 'commit') {
    return NextResponse.json({ error: 'Invalid import operation.' }, { status: 400 })
  }

  // class_id is never trusted for authorization. This query binds it to the
  // authenticated tenant before it is passed to either preview or commit.
  const { data: selectedClass } = await verifyClass(supabase, tenantId, classId)
  if (!selectedClass) {
    return NextResponse.json({ error: 'Selected class does not belong to this school.' }, { status: 403 })
  }

  if (mode === 'commit') {
    const rowsRaw = String(form.get('rows') || '[]')
    const filename = String(form.get('filename') || '').trim().slice(0, 255)

    let parsedRows: unknown
    try {
      parsedRows = JSON.parse(rowsRaw)
    } catch {
      return NextResponse.json({ error: 'Invalid preview payload.' }, { status: 400 })
    }

    if (!Array.isArray(parsedRows) || parsedRows.length > MAX_COMMIT_ROWS) {
      return NextResponse.json({ error: 'The import contains too many rows.' }, { status: 400 })
    }

    // Only the fields needed by the commit function are accepted. In
    // particular, any classId/status supplied by the browser is ignored.
    const rows: StudentPreviewRow[] = []
    for (const value of parsedRows) {
      if (!value || typeof value !== 'object') {
        return NextResponse.json({ error: 'Invalid preview row.' }, { status: 400 })
      }

      const row = value as Record<string, unknown>
      if (!Number.isInteger(row.row) || typeof row.admissionNo !== 'string' || typeof row.fullName !== 'string') {
        return NextResponse.json({ error: 'Invalid preview row.' }, { status: 400 })
      }

      rows.push({
        row: row.row as number,
        admissionNo: row.admissionNo,
        fullName: row.fullName,
        guardianPhone: typeof row.guardianPhone === 'string' ? row.guardianPhone : '',
        className: selectedClass.name,
        classId: selectedClass.id,
        status: 'new',
        errors: [],
      })
    }

    const result = await commitStudentImport(supabase, tenantId, selectedClass.id, rows)

    const { error: auditError } = await supabase.from('import_batches').insert({
      tenant_id: tenantId,
      kind: 'students',
      performed_by: userId,
      class_id: selectedClass.id,
      filename: filename || null,
      total_rows: rows.length,
      created_count: result.created,
      updated_count: 0,
      skipped_count: result.skipped,
      failed_count: result.failed,
      status: result.errors.length ? 'rejected' : 'completed',
      error_report: result.errors,
    })

    revalidatePath('/dashboard/students')
    revalidatePath('/dashboard/marks')
    revalidatePath('/dashboard/broadsheets')

    return NextResponse.json({
      ...result,
      selectedClass,
      auditRecorded: !auditError,
    })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A CSV file is required.' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File is too large. The maximum CSV size is 2 MB.' }, { status: 400 })
  }
  if (!/\.csv$/i.test(file.name)) {
    return NextResponse.json({ error: 'Only .csv files are supported.' }, { status: 400 })
  }

  const csvText = await file.text()
  const preview = await buildStudentImportPreview(
    supabase,
    tenantId,
    selectedClass.id,
    selectedClass.name,
    csvText,
  )

  return NextResponse.json(preview)
}
