import { getAssessmentAnalysis } from '@/lib/analysis'
import { getDashboardSession } from '@/lib/supabase/session'
import { getScopeStreams, getScopeExams } from '@/lib/scope'
import AnalysisExplorer from '@/components/analysis/AnalysisExplorer'
import CascadingFilterBar from '@/components/CascadingFilterBar'
import { AlertCircle, BarChart3 } from 'lucide-react'

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<{ exam?: string; class?: string; stream?: string }> }) {
  const params = await searchParams
  const { supabase, user, tenantId } = await getDashboardSession()
  if (!user) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-600">Please sign in to view school analysis.</p>
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

  // Cascade level 1 — all grades
  const { data: allClasses } = await supabase
    .from('classes')
    .select('id,name')
    .eq('tenant_id', tenantId)
    .order('name')

  // Cascade level 2 — streams for selected grade
  const streams = params.class ? await getScopeStreams(supabase, tenantId, params.class) : []
  const hasStreams = streams.length > 0

  // Cascade level 3 — assessments for selected grade
  const exams = params.class ? await getScopeExams(supabase, tenantId, params.class) : []
  const hasExams = exams.length > 0

  const gradeValid = Boolean(params.class && (allClasses ?? []).some(c => c.id === params.class))

  const analysis = params.exam && gradeValid ? await getAssessmentAnalysis(params.exam, params.stream) : null

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="eyebrow">School Performance Intelligence</p>
          <h1 className="title">Assessment Analysis</h1>
          <p className="text-xs text-slate-500 mt-1">
            Select a grade, then assessment to view analysis. Drill into a stream, learning area, or learner.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <BarChart3 className="h-3.5 w-3.5" /> Real data · blank scores are absent
          </span>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <CascadingFilterBar
          basePath="/dashboard/analysis"
          submitLabel="Run Analysis"
          values={{ class: params.class, stream: params.stream, exam: params.exam }}
          fields={[
            {
              name: 'class',
              label: 'Grade',
              placeholder: 'Select grade',
              required: true,
              clears: ['stream', 'exam'],
              options: (allClasses ?? []).map(c => ({ value: c.id, label: c.name })),
            },
            {
              name: 'stream',
              label: 'Stream',
              placeholder: !params.class ? 'Select grade first' : hasStreams ? 'All streams' : 'No streams',
              disabled: !hasStreams,
              clears: ['exam'],
              options: streams.map(s => ({ value: s.id, label: s.name })),
            },
            {
              name: 'exam',
              label: 'Assessment',
              placeholder: !params.class ? 'Select grade first' : hasExams ? 'Select assessment' : 'No assessments',
              required: true,
              disabled: !hasExams || !params.class,
              clears: [],
              options: exams.map(e => ({ value: e.id, label: e.name })),
            },
          ]}
        />
      </div>

      {analysis && 'error' in analysis && (
        <div className="notice warning">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="font-medium">{analysis.error}</span>
        </div>
      )}

      {analysis && 'grades' in analysis && (
        <AnalysisExplorer analysis={analysis} initialGradeId={params.class} />
      )}
    </div>
  )
}
