import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { toCsv } from '@/lib/csv'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return new Response('No school linked', { status: 403 })

  const url = new URL(request.url)
  const examId = url.searchParams.get('exam')
  const classId = url.searchParams.get('class')
  if (!examId || !classId) return new Response('exam and class are required', { status: 400 })

  const [{ data: exam }, { data: cls }] = await Promise.all([
    supabase.from('exams').select('id').eq('id', examId).eq('tenant_id', profile.tenant_id).maybeSingle(),
    supabase.from('classes').select('id').eq('id', classId).eq('tenant_id', profile.tenant_id).maybeSingle(),
  ])
  if (!exam || !cls) return new Response('Examination or class not found', { status: 404 })

  const [{ data: examSubjectLinks }, { data: students }] = await Promise.all([
    supabase
      .from('exam_class_subjects')
      .select('subject_id')
      .eq('exam_id', examId)
      .eq('class_id', classId)
      .then((res) => res, (reason: unknown) => ({ data: null as null, error: reason })),
    supabase.from('students').select('admission_no,full_name').eq('tenant_id', profile.tenant_id).eq('class_id', classId).order('full_name'),
  ])
  const subjectIds = (examSubjectLinks ?? []).map(l => l.subject_id)
  const { data: subjects } = subjectIds.length
    ? await supabase.from('subjects').select('name').eq('tenant_id', profile.tenant_id).in('id', subjectIds).order('name')
    : { data: [] as { name: string }[] }

  const header = ['Adm No', 'Name', ...(subjects ?? []).map(s => s.name)]
  const rows = (students ?? []).map(s => [s.admission_no, s.full_name, ...(subjects ?? []).map(() => '')])

  const csv = toCsv([header, ...rows])
  return new NextResponse(csv, {
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="results-import-template.csv"' },
  })
}
