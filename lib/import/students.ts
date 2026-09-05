import { parseCsv, normalizeHeader } from '@/lib/csv'
import { toTitleCase } from '@/lib/format-name'
import type { SupabaseClient } from '@supabase/supabase-js'

export type StudentRowError = { row: number; field: string; value: string; reason: string }

export type StudentPreviewRow = {
  row: number
  admissionNo: string
  fullName: string
  guardianPhone: string
  className: string
  classId: string
  status: 'new' | 'existing' | 'error'
  errors: string[]
}

export type StudentImportPreview = {
  headers: string[]
  selectedClass: { id: string; name: string }
  rows: StudentPreviewRow[]
  errors: StudentRowError[]
  summary: { total: number; new: number; existing: number; invalid: number }
}

const REQUIRED_HEADERS = ['adm no', 'name']
const OPTIONAL_HEADERS = ['parent phone']

function hasUnclosedQuote(text: string): boolean {
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '"') continue
    if (inQuotes && text[i + 1] === '"') {
      i += 1
      continue
    }
    inQuotes = !inQuotes
  }
  return inQuotes
}

export async function buildStudentImportPreview(
  supabase: SupabaseClient,
  tenantId: string,
  classId: string,
  className: string,
  csvText: string,
): Promise<StudentImportPreview> {
  const selectedClass = { id: classId, name: className }
  const emptySummary = { total: 0, new: 0, existing: 0, invalid: 0 }

  if (!csvText.trim()) {
    return {
      headers: [],
      selectedClass,
      rows: [],
      errors: [{ row: 0, field: 'file', value: '', reason: 'The file is empty.' }],
      summary: emptySummary,
    }
  }

  if (hasUnclosedQuote(csvText)) {
    return {
      headers: [],
      selectedClass,
      rows: [],
      errors: [{ row: 0, field: 'file', value: '', reason: 'The CSV file contains an unclosed quoted field.' }],
      summary: emptySummary,
    }
  }

  const table = parseCsv(csvText)
  if (!table.length) {
    return {
      headers: [],
      selectedClass,
      rows: [],
      errors: [{ row: 0, field: 'file', value: '', reason: 'The file is empty.' }],
      summary: emptySummary,
    }
  }

  const headers = table[0].map((h) => h.trim())
  const normalizedHeaders = headers.map(normalizeHeader)
  const validHeaders =
    normalizedHeaders.length >= 2 &&
    normalizedHeaders.length <= 3 &&
    normalizedHeaders[0] === REQUIRED_HEADERS[0] &&
    normalizedHeaders[1] === REQUIRED_HEADERS[1] &&
    (normalizedHeaders.length === 2 || normalizedHeaders[2] === OPTIONAL_HEADERS[0])

  if (!validHeaders) {
    return {
      headers,
      selectedClass,
      rows: [],
      errors: [
        {
          row: 1,
          field: 'headers',
          value: headers.join(', '),
          reason: 'The file must contain "Adm No" and "Name" columns in that order, optionally followed by a "Parent Phone" column.',
        },
      ],
      summary: emptySummary,
    }
  }

  const dataRows = table.slice(1)
  const parsedRows: { row: number; admissionNo: string; fullName: string; guardianPhone: string; errors: string[] }[] = []
  const admissionNumbers = new Set<string>()
  const errors: StudentRowError[] = []

  dataRows.forEach((cells, i) => {
    const rowNumber = i + 2
    const admissionNo = (cells[0] ?? '').trim()
    const fullName = (cells[1] ?? '').trim()
    const guardianPhone = (cells[2] ?? '').trim().slice(0, 50)
    const rowErrors: string[] = []

    if (cells.length > 3) {
      rowErrors.push('Too many columns. Only Adm No, Name and optional Parent Phone are allowed.')
      errors.push({ row: rowNumber, field: 'file', value: cells.slice(3).join(', '), reason: 'Only "Adm No", "Name" and optional "Parent Phone" columns are allowed.' })
    }

    if (!admissionNo) {
      rowErrors.push('Admission number is required.')
      errors.push({ row: rowNumber, field: 'Adm No', value: admissionNo, reason: 'Admission number is required.' })
    }

    if (!fullName) {
      rowErrors.push('Student name is required.')
      errors.push({ row: rowNumber, field: 'Name', value: fullName, reason: 'Student name is required.' })
    }

    const key = admissionNo.toLowerCase()
    if (admissionNo && admissionNumbers.has(key)) {
      rowErrors.push('Duplicate admission number within this file.')
      errors.push({ row: rowNumber, field: 'Adm No', value: admissionNo, reason: 'Duplicate admission number within this file.' })
    }
    if (admissionNo) admissionNumbers.add(key)

    parsedRows.push({ row: rowNumber, admissionNo, fullName, guardianPhone, errors: rowErrors })
  })

  const candidates = parsedRows.filter((row) => row.errors.length === 0)
  const { data: existingStudents, error: existingError } = candidates.length
    ? await supabase
        .from('students')
        .select('admission_no')
        .eq('tenant_id', tenantId)
        .in('admission_no', candidates.map((row) => row.admissionNo))
    : { data: [], error: null }

  if (existingError) {
    return {
      headers,
      selectedClass,
      rows: parsedRows.map((row) => ({
        ...row,
        className,
        classId,
        status: 'error' as const,
      })),
      errors: [
        ...errors,
        { row: 0, field: 'database', value: '', reason: 'The existing students could not be checked. Please try again.' },
      ],
      summary: { total: parsedRows.length, new: 0, existing: 0, invalid: parsedRows.length },
    }
  }

  const existing = new Set(
    (existingStudents ?? []).map((student: { admission_no: string }) => student.admission_no.trim().toLowerCase()),
  )
  const rows: StudentPreviewRow[] = parsedRows.map((row) => {
    const key = row.admissionNo.toLowerCase()
    const status: StudentPreviewRow['status'] = row.errors.length
      ? 'error'
      : existing.has(key)
        ? 'existing'
        : 'new'
    return { ...row, className, classId, status }
  })

  return {
    headers,
    selectedClass,
    rows,
    errors,
    summary: {
      total: rows.length,
      new: rows.filter((row) => row.status === 'new').length,
      existing: rows.filter((row) => row.status === 'existing').length,
      invalid: rows.filter((row) => row.status === 'error').length,
    },
  }
}

export type StudentImportCommitResult = {
  created: number
  skipped: number
  failed: number
  errors: StudentRowError[]
}

export async function commitStudentImport(
  supabase: SupabaseClient,
  tenantId: string,
  classId: string,
  rows: StudentPreviewRow[],
): Promise<StudentImportCommitResult> {
  const errors: StudentRowError[] = []
  const candidates: { row: number; admissionNo: string; fullName: string; guardianPhone: string }[] = []
  const seen = new Set<string>()
  let skipped = 0

  for (const row of rows) {
    const admissionNo = String(row.admissionNo || '').trim()
    const fullName = String(row.fullName || '').trim()
    const guardianPhone = String(row.guardianPhone || '').trim().slice(0, 50)
    const rowNumber = Number.isInteger(row.row) ? row.row : 0

    if (!admissionNo) {
      errors.push({ row: rowNumber, field: 'Adm No', value: admissionNo, reason: 'Admission number is required.' })
      continue
    }
    if (!fullName) {
      errors.push({ row: rowNumber, field: 'Name', value: fullName, reason: 'Student name is required.' })
      continue
    }

    const key = admissionNo.toLowerCase()
    if (seen.has(key)) {
      errors.push({ row: rowNumber, field: 'Adm No', value: admissionNo, reason: 'Duplicate admission number within this file.' })
      continue
    }
    seen.add(key)
    candidates.push({ row: rowNumber, admissionNo, fullName, guardianPhone })
  }

  if (!candidates.length) {
    return { created: 0, skipped, failed: errors.length, errors }
  }

  // Re-check at commit time. Preview is advisory; the database is authoritative.
  const { data: existingRows, error: existingError } = await supabase
    .from('students')
    .select('admission_no')
    .eq('tenant_id', tenantId)
    .in('admission_no', candidates.map((row) => row.admissionNo))

  if (existingError) {
    errors.push({ row: 0, field: 'database', value: '', reason: 'Could not verify existing admission numbers. No students were imported.' })
    return { created: 0, skipped, failed: errors.length, errors }
  }

  const existing = new Set(
    (existingRows ?? []).map((student: { admission_no: string }) => student.admission_no.trim().toLowerCase()),
  )
  const toInsert = candidates.filter((row) => {
    if (existing.has(row.admissionNo.toLowerCase())) {
      skipped += 1
      return false
    }
    return true
  })

  let created = 0

  // Batch inserts (chunked) so large rosters do not pay one round trip per
  // learner. Rows are never overwritten: a real unique-key race on an
  // admission number is resolved by re-checking that chunk and splitting the
  // remainder back into single inserts, keeping the original semantics where a
  // conflicting row is skipped rather than updated or wiping valid siblings.
  const chunkSize = 100
  const recordError = (
    error: { code?: string; message?: string },
    row: { row: number; admissionNo: string; fullName: string },
  ) => {
    if (error.code === '23505') {
      skipped += 1
      return
    }
    errors.push({
      row: row.row,
      field: 'student',
      value: `${row.admissionNo} — ${row.fullName}`,
      reason: 'This student could not be imported.',
    })
  }
  const buildPayload = (
    row: { row: number; admissionNo: string; fullName: string; guardianPhone: string },
    includePhone: boolean,
  ) => {
    const base: Record<string, unknown> = { tenant_id: tenantId, admission_no: row.admissionNo, full_name: toTitleCase(row.fullName), class_id: classId }
    if (!includePhone) return base
    const phone = String(row.guardianPhone || '').trim()
    return phone ? { ...base, guardian_phone: phone } : base
  }
  let includePhoneColumn = true
  const insertChunk = async (chunk: { row: number; admissionNo: string; fullName: string; guardianPhone: string }[]) => {
    const { error } = await supabase.from('students').insert(chunk.map((row) => buildPayload(row, includePhoneColumn)))
    if (error && (error.code === '42703' || String(error.message ?? '').toLowerCase().includes('guardian_phone'))) {
      includePhoneColumn = false
      return await supabase.from('students').insert(chunk.map((row) => buildPayload(row, false)))
    }
    return { error }
  }
  const insertOne = async (row: { row: number; admissionNo: string; fullName: string; guardianPhone: string }) => {
    const { error } = await insertChunk([row])
    if (!error) {
      created += 1
      return
    }
    recordError(error, row)
  }

  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize)
    const { error } = await insertChunk(chunk)
    if (!error) {
      created += chunk.length
      continue
    }
    if (error.code === '23505') {
      // A unique admission number collided within this chunk. Re-check the
      // database, then insert only the rows that are still genuinely new.
      const { data: existingRows, error: existingError } = await supabase
        .from('students')
        .select('admission_no')
        .eq('tenant_id', tenantId)
        .in('admission_no', chunk.map((row) => row.admissionNo))
      if (existingError) {
        for (const row of chunk) await insertOne(row)
        continue
      }
      const existing = new Set(
        (existingRows ?? []).map((student: { admission_no: string }) => student.admission_no.trim().toLowerCase()),
      )
      for (const row of chunk) {
        if (existing.has(row.admissionNo.toLowerCase())) skipped += 1
        else await insertOne(row)
      }
      continue
    }
    for (const row of chunk) await insertOne(row)
  }

  return { created, skipped, failed: errors.length, errors }
}
