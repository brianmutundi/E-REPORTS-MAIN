'use server'

import { revalidatePath } from 'next/cache'
import { getDashboardSession } from '@/lib/supabase/session'
import { verifyScope } from '@/lib/scope'
import { friendlyDbMessage } from '@/lib/db-errors'

export type SaveMarksGridResult =
  | { ok: true; conflicts: string[] }
  | { ok: false; kind: 'session' | 'scope' | 'validation' | 'db'; message: string }

export interface MarksGridEntry {
  studentId: string
  /** Raw input value as typed ('' when the cell was left blank). */
  raw: string
  /** Mark.updated_at the grid was loaded with ('' for a learner with no score yet). */
  prev: string
}

const SESSION_MESSAGE = 'Your session has expired. Please sign in again and retry — nothing you entered has been lost.'

/**
 * Save one scope's marks. Unlike the old form action this never redirects on
 * failure: it returns a result object instead, so the client grid can keep every
 * entered value on the screen when a validation, scope, session or network
 * problem prevents the save from completing.
 *
 * Each submitted row carries the mark version it was loaded with; the atomic
 * save_marks_grid RPC applies each row only when its version still matches, so
 * concurrent saves of the same grid never silently overwrite each other.
 */
export async function saveMarksGrid(
  examId: string,
  classId: string,
  subjectId: string,
  entries: MarksGridEntry[],
): Promise<SaveMarksGridResult> {
  const { supabase, user, tenantId } = await getDashboardSession()

  if (!user) return { ok: false, kind: 'session', message: SESSION_MESSAGE }
  if (!tenantId) return { ok: false, kind: 'session', message: 'No school is linked to this account.' }
  if (!examId || !classId || !subjectId) {
    return { ok: false, kind: 'scope', message: 'Missing assessment, grade or learning area.' }
  }

  const scoped = await verifyScope(supabase, tenantId, examId, classId, subjectId)
  if (!scoped) return { ok: false, kind: 'scope', message: 'Assign this grade and learning area to the assessment first.' }

  const { data: students } = await supabase
    .from('students')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('class_id', classId)
    .order('full_name')

  const entryById = new Map<string, MarksGridEntry>()
  for (const entry of entries) entryById.set(entry.studentId, entry)

  const studentIds: string[] = []
  const scores: (number | null)[] = []
  const baseUpdatedAts: (string | null)[] = []

  // Blank = absent. When a learner had no recorded score when the grid loaded
  // there is nothing to change; clearing an existing score is a real change and
  // is sent with its loaded version.
  for (const student of students ?? []) {
    const entry = entryById.get(student.id)
    if (!entry) continue
    const raw = entry.raw.trim()
    const base = entry.prev.trim() || null
    if (raw === '') {
      if (base === null) continue
      studentIds.push(student.id)
      scores.push(null)
      baseUpdatedAts.push(base)
      continue
    }
    const score = Number(raw)
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return { ok: false, kind: 'validation', message: 'Each score must be between 0 and 100.' }
    }
    studentIds.push(student.id)
    scores.push(score)
    baseUpdatedAts.push(base)
  }

  if (!studentIds.length) return { ok: true, conflicts: [] }

  const { data: applied, error } = await supabase.rpc('save_marks_grid', {
    p_exam_id: examId,
    p_subject_id: subjectId,
    p_class_id: classId,
    p_student_ids: studentIds,
    p_scores: scores,
    p_base_updated_ats: baseUpdatedAts,
  })

  if (error) {
    // Pre-migration database: save_marks_grid does not exist yet, so keep the
    // previous atomic-upsert behaviour (database unique constraint still
    // prevents duplicates).
    if (error.code === 'PGRST202' || /cannot find the function|does not exist/i.test(error.message ?? '')) {
      const { data: studentsForFallback } = await supabase
        .from('students')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('class_id', classId)
        .order('full_name')

      const rows: { tenant_id: string; exam_id: string; student_id: string; subject_id: string; score: number; updated_at: string }[] = []
      const blankStudentIds: string[] = []
      for (const student of studentsForFallback ?? []) {
        const entry = entryById.get(student.id)
        const raw = entry?.raw.trim() ?? ''
        const base = entry?.prev.trim() || null
        if (raw === '') {
          if (base !== null) blankStudentIds.push(student.id)
          continue
        }
        rows.push({
          tenant_id: tenantId,
          exam_id: examId,
          student_id: student.id,
          subject_id: subjectId,
          score: Number(raw),
          updated_at: new Date().toISOString(),
        })
      }
      if (rows.length) {
        const { error: upsertError } = await supabase
          .from('marks')
          .upsert(rows, { onConflict: 'tenant_id,exam_id,student_id,subject_id' })
        if (upsertError) return { ok: false, kind: 'db', message: friendlyDbMessage(upsertError) }
      }
      if (blankStudentIds.length) {
        const { error: clearError } = await supabase
          .from('marks')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('exam_id', examId)
          .eq('subject_id', subjectId)
          .in('student_id', blankStudentIds)
        if (clearError) return { ok: false, kind: 'db', message: friendlyDbMessage(clearError) }
      }
      revalidatePaths()
      return { ok: true, conflicts: [] }
    }
    return { ok: false, kind: 'db', message: friendlyDbMessage(error) }
  }

  const conflicts = (applied ?? [])
    .filter((r: { student_id: string; status: string }) => r.status === 'conflict')
    .map((r: { student_id: string; status: string }) => r.student_id)

  revalidatePaths()
  return { ok: true, conflicts }
}

function revalidatePaths() {
  revalidatePath('/dashboard/marks')
  revalidatePath('/dashboard/marks/import')
  revalidatePath('/dashboard/broadsheets')
  revalidatePath('/dashboard/reports')
  revalidatePath('/dashboard/analysis')
}