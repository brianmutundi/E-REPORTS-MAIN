import { parseCsv, normalizeHeader } from '@/lib/csv'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ResultsRowError = { row: number; field: string; value: string; reason: string }

export type ResultsPreviewCell = { subjectId: string; subjectName: string; score: number | null; error?: string }

export type ResultsPreviewRow = {
  row: number
  admissionNo: string
  nameInFile: string
  studentId: string | null
  matchedName: string | null
  nameMismatch: boolean
  status: 'ok' | 'error'
  errors: string[]
  cells: ResultsPreviewCell[]
}

export type ColumnMapping = { column: number; header: string; subjectId: string; subjectName: string }

export type ResultsImportPreview = {
  headers: string[]
  columnMapping: ColumnMapping[]
  unmatchedHeaders: string[]
  rows: ResultsPreviewRow[]
  errors: ResultsRowError[]
  summary: { total: number; ok: number; invalid: number }
}

const IDENTITY_HEADERS = ['adm no', 'name']

/**
 * Resolves each non-identity header to a tenant subject by normalized
 * name or code — never by column position. Ambiguous or unknown headers
 * are reported rather than guessed, per the spec's import matching rules.
 */
function resolveSubjectColumns(
  headers: string[],
  subjects: { id: string; name: string; code: string | null }[],
): { mapping: ColumnMapping[]; unmatched: string[]; duplicate: string[] } {
  const byName = new Map(subjects.map(s => [normalizeHeader(s.name), s]))
  const byCode = new Map(subjects.filter(s => s.code).map(s => [normalizeHeader(s.code as string), s]))

  const mapping: ColumnMapping[] = []
  const unmatched: string[] = []
  const duplicate: string[] = []
  const usedSubjectIds = new Set<string>()

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header)
    if (IDENTITY_HEADERS.includes(normalized)) return

    const match = byName.get(normalized) ?? byCode.get(normalized)
    if (!match) { unmatched.push(header); return }
    if (usedSubjectIds.has(match.id)) { duplicate.push(header); return }
    usedSubjectIds.add(match.id)
    mapping.push({ column: index, header, subjectId: match.id, subjectName: match.name })
  })

  return { mapping, unmatched, duplicate }
}

export async function buildResultsImportPreview(
  supabase: SupabaseClient,
  tenantId: string,
  params: { examId: string; classId: string; csvText: string },
): Promise<ResultsImportPreview> {
  const { examId, classId, csvText } = params
  const table = parseCsv(csvText)
  if (!table.length) {
    return { headers: [], columnMapping: [], unmatchedHeaders: [], rows: [], errors: [{ row: 0, field: 'file', value: '', reason: 'The file is empty.' }], summary: { total: 0, ok: 0, invalid: 0 } }
  }

  const headers = table[0].map(h => h.trim())
  const normalizedHeaders = headers.map(normalizeHeader)
  const admIdx = normalizedHeaders.indexOf('adm no')
  const nameIdx = normalizedHeaders.indexOf('name')
  const errors: ResultsRowError[] = []

  if (admIdx === -1 || nameIdx === -1) {
    return {
      headers, columnMapping: [], unmatchedHeaders: [], rows: [],
      errors: [{ row: 0, field: 'headers', value: headers.join(', '), reason: 'The file must include "Adm No" and "Name" columns.' }],
      summary: { total: 0, ok: 0, invalid: 0 },
    }
  }

  // Learning areas assigned to this exam AND this grade only — never
  // subjects outside the exam's configured scope for that grade.
  const { data: subjectLinks } = await supabase
    .from('exam_class_subjects')
    .select('subject_id')
    .eq('exam_id', examId)
    .eq('class_id', classId)
    .then((res) => res, (reason: unknown) => ({ data: null as null, error: reason }))
  const scopedSubjectIds = new Set((subjectLinks ?? []).map(l => l.subject_id))
  const { data: allSubjects } = await supabase.from('subjects').select('id,name,code').eq('tenant_id', tenantId)
  const examSubjects = (allSubjects ?? []).filter(s => scopedSubjectIds.has(s.id))

  const { mapping, unmatched, duplicate } = resolveSubjectColumns(headers, examSubjects)
  if (unmatched.length) errors.push({ row: 0, field: 'headers', value: unmatched.join(', '), reason: 'Unknown learning-area column(s) — they do not match a subject assigned to this examination and grade.' })
  if (duplicate.length) errors.push({ row: 0, field: 'headers', value: duplicate.join(', '), reason: 'Duplicate learning-area column(s) detected.' })

  // Students enrolled in the selected class only.
  const { data: classStudents } = await supabase.from('students').select('id,admission_no,full_name').eq('tenant_id', tenantId).eq('class_id', classId)
  const studentByAdm = new Map((classStudents ?? []).map(s => [s.admission_no.trim().toLowerCase(), s]))

  // Existing marks for this exam/class's students — used to flag rows
  // that would overwrite rather than create.
  const studentIds = (classStudents ?? []).map(s => s.id)
  const { data: existingMarks } = studentIds.length
    ? await supabase.from('marks').select('student_id,subject_id').eq('exam_id', examId).in('student_id', studentIds)
    : { data: [] as { student_id: string; subject_id: string }[] }
  const existingMarkKeys = new Set((existingMarks ?? []).map(m => `${m.student_id}:${m.subject_id}`))

  const dataRows = table.slice(1)
  const seenAdm = new Set<string>()
  const rows: ResultsPreviewRow[] = []

  dataRows.forEach((cells, i) => {
    const rowNumber = i + 2
    if (cells.every(c => c.trim() === '')) return

    const admissionNo = (cells[admIdx] ?? '').trim()
    const nameInFile = (cells[nameIdx] ?? '').trim()
    const rowErrors: string[] = []

    if (!admissionNo) { rowErrors.push('Admission number is required.'); errors.push({ row: rowNumber, field: 'Adm No', value: admissionNo, reason: 'Admission number is required.' }) }

    const key = admissionNo.toLowerCase()
    if (admissionNo && seenAdm.has(key)) { rowErrors.push('Duplicate student row in this file.'); errors.push({ row: rowNumber, field: 'Adm No', value: admissionNo, reason: 'Duplicate student row in this file.' }) }
    if (admissionNo) seenAdm.add(key)

    const student = admissionNo ? studentByAdm.get(key) : undefined
    if (admissionNo && !student) { rowErrors.push('Admission number not found in the selected class.'); errors.push({ row: rowNumber, field: 'Adm No', value: admissionNo, reason: 'This admission number does not belong to a student in the selected class.' }) }

    const nameMismatch = !!student && nameInFile !== '' && normalizeHeader(student.full_name) !== normalizeHeader(nameInFile)
    if (nameMismatch) { rowErrors.push('Name does not match the student on record for this admission number.'); errors.push({ row: rowNumber, field: 'Name', value: nameInFile, reason: `Name "${nameInFile}" does not match the recorded name "${student!.full_name}" for this admission number.` }) }

    const resultCells: ResultsPreviewCell[] = mapping.map(col => {
      const raw = (cells[col.column] ?? '').trim()
      if (raw === '') return { subjectId: col.subjectId, subjectName: col.subjectName, score: null }
      const score = Number(raw)
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        rowErrors.push(`Invalid score for ${col.subjectName}.`)
        errors.push({ row: rowNumber, field: col.subjectName, value: raw, reason: 'Score must be a number between 0 and 100.' })
        return { subjectId: col.subjectId, subjectName: col.subjectName, score: null, error: 'Invalid score' }
      }
      if (student && existingMarkKeys.has(`${student.id}:${col.subjectId}`)) {
        return { subjectId: col.subjectId, subjectName: col.subjectName, score, error: 'Existing mark — will not be overwritten' }
      }
      return { subjectId: col.subjectId, subjectName: col.subjectName, score }
    })

    rows.push({
      row: rowNumber,
      admissionNo,
      nameInFile,
      studentId: student?.id ?? null,
      matchedName: student?.full_name ?? null,
      nameMismatch,
      status: rowErrors.length ? 'error' : 'ok',
      errors: rowErrors,
      cells: resultCells,
    })
  })

  const summary = { total: rows.length, ok: rows.filter(r => r.status === 'ok').length, invalid: rows.filter(r => r.status === 'error').length }

  return { headers, columnMapping: mapping, unmatchedHeaders: unmatched.concat(duplicate), rows, errors, summary }
}

export type ResultsImportCommitResult = { created: number; skipped: number; failed: number; errors: ResultsRowError[] }

/**
 * Commits validated rows. Only 'ok' rows are written, and within those,
 * only cells with a numeric score and no existing mark for that
 * exam/student/subject — matching marks are never silently overwritten.
 */
export async function commitResultsImport(
  supabase: SupabaseClient,
  tenantId: string,
  params: { examId: string; rows: ResultsPreviewRow[] },
): Promise<ResultsImportCommitResult> {
  const { examId, rows } = params
  const errors: ResultsRowError[] = []
  const toInsert: { tenant_id: string; exam_id: string; student_id: string; subject_id: string; score: number }[] = []
  let skipped = 0

  for (const row of rows) {
    if (row.status !== 'ok' || !row.studentId) { continue }
    for (const cell of row.cells) {
      if (cell.score === null) continue
      if (cell.error) { skipped++; continue }
      toInsert.push({ tenant_id: tenantId, exam_id: examId, student_id: row.studentId, subject_id: cell.subjectId, score: cell.score })
    }
  }

  let created = 0
  if (toInsert.length) {
    // insert (not upsert) — an existing mark for this exam/student/subject
    // triggers the unique-constraint violation rather than being
    // overwritten, consistent with "never silently overwrite an existing
    // mark."
    const { data: inserted, error } = await supabase.from('marks').insert(toInsert).select('id')
    if (error) {
      errors.push({ row: 0, field: 'batch', value: '', reason: error.message })
    } else {
      created = inserted?.length ?? 0
    }
  }

  const failed = rows.filter(r => r.status === 'error').length

  return { created, skipped, failed, errors }
}
