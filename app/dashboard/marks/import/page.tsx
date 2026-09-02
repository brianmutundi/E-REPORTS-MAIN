import { getDashboardSession } from '@/lib/supabase/session'
import ResultsImportWizard from './ResultsImportWizard'

export default async function ResultsImportPage() {
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-600">Please sign in to access bulk results import.</p>
      </div>
    )
  }
  if (!tenantId) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-600">No school is linked to this account.</p>
      </div>
    )
  }

  const [{ data: exams }, { data: classes }, { data: examClassLinks }] = await Promise.all([
    supabase.from('exams').select('id,name,term,academic_year').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabase.from('classes').select('id,name').eq('tenant_id', tenantId).order('name'),
    supabase.from('exam_classes').select('exam_id,class_id').then((res) => res, (reason: unknown) => ({ data: null as null, error: reason })),
  ])

  const classIdsByExam = new Map<string, string[]>()
  for (const link of examClassLinks ?? []) {
    const list = classIdsByExam.get(link.exam_id) ?? []
    list.push(link.class_id)
    classIdsByExam.set(link.exam_id, list)
  }

  return <ResultsImportWizard exams={exams ?? []} classes={classes ?? []} classIdsByExam={classIdsByExam} />
}
