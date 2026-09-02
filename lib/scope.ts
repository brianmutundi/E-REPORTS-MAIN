import type { SupabaseClient } from '@supabase/supabase-js'

export type ScopeGrade = { id: string; name: string }

export type ScopeStream = { id: string; name: string }

export type ScopeExam = { id: string; name: string; term: string | null; academic_year: number | null; assessment_component: 'mid_term' | 'end_term' | null }

export type ScopeSubject = { subjectId: string; subjectName: string; code: string | null }

/**
 * Single authoritative scope resolver for the Assessment Entry cascade.
 *
 * The database is the source of truth at every level:
 *   Assessment -> Grades            from exam_classes
 *   Assessment+Grade -> Learning Areas from exam_class_subjects
 *   Grade -> Learners               from students.class_id
 *
 * Queries are tenant-locked twice: row-level security scopes the junction
 * reads via the assessment's tenant, and every lookup here additionally
 * filters names by the caller's tenant. If the exam_class_subjects table
 * has not been created yet (pre-migration), every helper reports "nothing
 * configured" — an empty scope, never a fabricated fallback — which is
 * exactly the DB-backed empty state the UI must show.
 */

const examSubjectError = (error: unknown) => {
  // PostgREST reports a missing relation as an error; treat it as an
  // unconfigured scope instead of crashing.
  return Boolean(error)
}

export async function getScopeGrades(
  supabase: SupabaseClient,
  tenantId: string,
  examId: string,
): Promise<ScopeGrade[]> {
  if (!examId) return []
  const { data: links, error } = await supabase
    .from('exam_classes')
    .select('class_id')
    .eq('exam_id', examId)
  if (error || !links || links.length === 0) return []
  const ids = links.map(l => l.class_id)
  const { data: classes, error: clsError } = await supabase
    .from('classes')
    .select('id,name')
    .eq('tenant_id', tenantId)
    .in('id', ids)
    .order('name')
  if (clsError || !classes) return []
  const byId = new Map(classes.map(c => [c.id, c.name]))
  return links
    .map(l => ({ id: l.class_id, name: byId.get(l.class_id) ?? 'Grade' }))
    .filter((g, i, arr) => arr.findIndex(x => x.id === g.id) === i)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getScopeStreams(
  supabase: SupabaseClient,
  tenantId: string,
  classId: string,
): Promise<ScopeStream[]> {
  if (!classId) return []
  const { data: streams, error } = await supabase
    .from('streams')
    .select('id,name')
    .eq('tenant_id', tenantId)
    .eq('class_id', classId)
    .order('name')
  if (error || !streams) return []
  return streams.map(s => ({ id: s.id, name: s.name }))
}

export async function getScopeExams(
  supabase: SupabaseClient,
  tenantId: string,
  classId: string,
): Promise<ScopeExam[]> {
  if (!classId) return []
  const { data: links, error } = await supabase
    .from('exam_classes')
    .select('exam_id')
    .eq('class_id', classId)
  if (error || !links || links.length === 0) return []
  const ids = [...new Set(links.map(l => l.exam_id))]
  const { data: exams, error: examError } = await supabase
    .from('exams')
    .select('id,name,term,academic_year,assessment_component')
    .eq('tenant_id', tenantId)
    .in('id', ids)
    .order('created_at', { ascending: false })
  if (examError || !exams) return []
  return exams.map(e => ({ id: e.id, name: e.name, term: e.term, academic_year: e.academic_year, assessment_component: e.assessment_component as 'mid_term' | 'end_term' | null }))
}

export async function getScopeSubjects(
  supabase: SupabaseClient,
  tenantId: string,
  examId: string,
  classId: string,
): Promise<ScopeSubject[]> {
  if (!examId || !classId) return []
  const { data: links, error } = await supabase
    .from('exam_class_subjects')
    .select('subject_id')
    .eq('exam_id', examId)
    .eq('class_id', classId)
  if (examSubjectError(error) || !links || links.length === 0) return []
  const ids = links.map(l => l.subject_id)
  const { data: subjects, error: subjectError } = await supabase
    .from('subjects')
    .select('id,name,code')
    .eq('tenant_id', tenantId)
    .in('id', ids)
    .order('name')
  if (subjectError || !subjects) return []
  const byId = new Map(subjects.map(s => [s.id, s]))
  return links
    .map(l => {
      const subject = byId.get(l.subject_id)
      return subject ? { subjectId: subject.id, subjectName: subject.name, code: subject.code } : null
    })
    .filter((s): s is ScopeSubject => s !== null)
}

export async function verifyScope(
  supabase: SupabaseClient,
  tenantId: string,
  examId: string,
  classId: string,
  subjectId: string,
): Promise<boolean> {
  if (!tenantId || !examId || !classId || !subjectId) return false
  const [{ data: gradeLink }, { data: subjectLink }] = await Promise.all([
    supabase
      .from('exam_classes')
      .select('exam_id')
      .eq('exam_id', examId)
      .eq('class_id', classId)
      .maybeSingle(),
    supabase
      .from('exam_class_subjects')
      .select('subject_id')
      .eq('exam_id', examId)
      .eq('class_id', classId)
      .eq('subject_id', subjectId)
      .maybeSingle(),
  ])
  return Boolean(gradeLink && subjectLink)
}