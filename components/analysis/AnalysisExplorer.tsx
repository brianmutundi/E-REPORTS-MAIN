'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, TrendingUp, Users, Award, Gauge, BarChart3, BookOpen, FileDown } from 'lucide-react'
import { BarList, ColumnChart, Donut, KpiCard, Sparkline } from '@/components/charts'
import { levelColor, type AssessmentAnalysis, type GradeAnalysis, type LearnerAnalysis, type LearnerTrendScores } from '@/lib/analysis-types'

const ACCENTS = ['#059669', '#10b981', '#34d399', '#047857', '#14b8a6', '#a7f3d0']

export default function AnalysisExplorer({ analysis, initialGradeId, streamId }: { analysis: AssessmentAnalysis; initialGradeId?: string; streamId?: string }) {
  const [selectedGradeId, setSelectedGradeId] = useState<string | null>(initialGradeId ?? null)
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)
  const [trends, setTrends] = useState<Record<string, LearnerTrendScores[]>>({})
  const [trendLoading, setTrendLoading] = useState<Record<string, boolean>>({})

  const selectedGrade = useMemo(() => analysis.grades.find(g => g.classId === selectedGradeId) ?? null, [analysis.grades, selectedGradeId])

  useEffect(() => {
    if (!expandedStudent || trends[expandedStudent] || trendLoading[expandedStudent]) return
    setTrendLoading(prev => ({ ...prev, [expandedStudent]: true }))
    fetch(`/api/analysis/learner?student=${expandedStudent}`)
      .then(r => r.json())
      .then(data => setTrends(prev => ({ ...prev, [expandedStudent]: data.trend ?? [] })))
      .catch(() => {})
      .finally(() => setTrendLoading(prev => ({ ...prev, [expandedStudent]: false })))
  }, [expandedStudent, trends, trendLoading])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow">{analysis.examName}</p>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Grade Analysis</h2>
          <p className="text-xs text-slate-500 mt-1">{analysis.grades.length} grade(s) assessed · select a grade to drill into its full analysis</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedGrade ? (
            <button type="button" onClick={() => setSelectedGradeId(null)} className="btn secondary min-h-10 py-1.5 px-3">
              Show all grades
            </button>
          ) : null}
          <a
            href={`/api/analysis/export/pdf?exam=${analysis.examId}${selectedGrade ? `&class=${selectedGrade.classId}` : ''}${streamId ? `&stream=${streamId}` : ''}`}
            className="btn min-h-10 py-1.5 px-3"
            download
          >
            <FileDown className="h-4 w-4" />
            <span>Download PDF</span>
          </a>
        </div>
      </div>

      {!selectedGrade && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {analysis.grades.map((grade, i) => (
            <button
              key={grade.classId}
              type="button"
              onClick={() => setSelectedGradeId(grade.classId)}
              className="text-left rounded-2xl bg-white border border-slate-200/80 hover:border-emerald-300 hover:shadow-md transition-all p-5 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 font-bold text-slate-900">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCENTS[i % ACCENTS.length] }} />
                  {grade.className}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-600 transition-colors" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 py-2">
                  <p className="text-lg font-extrabold text-slate-900 tabular-nums">{grade.learnerCount}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Learners</p>
                </div>
                <div className="rounded-xl bg-slate-50 py-2">
                  <p className="text-lg font-extrabold text-slate-900 tabular-nums">{grade.averagePercent === null ? '—' : `${grade.averagePercent}%`}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Mean %</p>
                </div>
                <div className="rounded-xl bg-slate-50 py-2">
                  <p className="text-lg font-extrabold text-slate-900 tabular-nums">{grade.assessedCount}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assessed</p>
                </div>
              </div>
              {grade.topLearner ? (
                <p className="mt-3 text-[11px] font-medium text-slate-500 truncate">
                  Top: <span className="font-bold text-slate-800">{grade.topLearner}</span> · {grade.topTotal}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {selectedGrade && <GradePanels grade={selectedGrade} expandedStudent={expandedStudent} setExpandedStudent={setExpandedStudent} trends={trends} trendLoading={trendLoading} />}
    </div>
  )
}

function GradePanels({ grade, expandedStudent, setExpandedStudent, trends, trendLoading }: {
  grade: GradeAnalysis
  expandedStudent: string | null
  setExpandedStudent: (id: string | null) => void
  trends: Record<string, LearnerTrendScores[]>
  trendLoading: Record<string, boolean>
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">{grade.className}</h3>
        <span className="text-xs font-semibold text-slate-500">{grade.learnerCount} learners · {grade.assessedCount} fully assessed</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Learners Assessed" value={grade.assessedCount.toString()} sub={`of ${grade.learnerCount} enrolled`} accent="#059669" />
        <KpiCard label="Class Mean %" value={grade.averagePercent === null ? '—' : `${grade.averagePercent}%`} sub={`Mean total ${grade.averageTotal ?? '—'}`} accent="#10b981" />
        <KpiCard label="Top Learner" value={grade.topLearner ?? '—'} sub={grade.topTotal !== null ? `Total ${grade.topTotal}` : undefined} accent="#047857" />
        <KpiCard label="Learning Areas" value={grade.learningAreas.length.toString()} sub={`Assessed learners stay visible`} accent="#34d399" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2"><Gauge className="h-4 w-4 text-emerald-600" /> Performance Level Distribution (Overall)</h4>
          <Donut
            items={grade.levelDistribution.map((l, i) => ({ label: `${l.grade} — ${l.description}`, value: l.count, color: levelColor(i) }))}
            centerLabel={grade.assessedCount.toString()}
            centerSub="assessed"
          />
        </section>
        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-emerald-600" /> Learning Area Averages</h4>
          {grade.learningAreas.length === 0 ? <p className="text-xs text-slate-500">No learning areas assigned to this assessment.</p> : null}
          <ColumnChart items={grade.learningAreas.map(a => ({ label: a.subjectName, value: a.average ?? 0 }))} suffix="%" />
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2"><BookOpen className="h-4 w-4 text-emerald-600" /> Learning Area Coverage</h4>
          <BarList items={grade.learningAreas.map(a => ({ label: a.subjectName, value: a.assessedCount, hint: `/ ${a.learnerCount}`, color: '#059669' }))} />
        </section>
        {grade.streams.length > 0 && (
          <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
            <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-emerald-600" /> Stream Comparison</h4>
            <BarList items={grade.streams.map(s => ({ label: s.streamName, value: s.averageTotal ?? 0, hint: `/ ${grade.learningAreas.length * 100}`, color: '#10b981' }))} />
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {grade.streams.map(s => (
                <div key={s.streamId} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-800">{s.streamName}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{s.assessedCount}/{s.learnerCount} assessed · Top: {s.topLearner ?? '—'} ({s.topTotal ?? '—'})</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 pb-3 flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Award className="h-4 w-4 text-emerald-600" /> Learner Rankings</h4>
          <p className="text-[11px] text-slate-400">Ties share a position; next position skips · blank scores are absent, never zero</p>
        </div>
        <div className="table-rail">
          <table className="w-full text-left text-sm text-slate-600 min-w-[44rem]">
            <thead className="bg-slate-50 border-y border-slate-200 text-[11px] uppercase tracking-wider font-semibold text-slate-500 sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 bg-slate-50 px-4 py-3 w-14 text-center">Pos</th>
                <th className="sticky left-14 z-30 bg-slate-50 px-4 py-3 w-24">Adm No</th>
                <th className="sticky left-[9.5rem] z-30 bg-slate-50 px-4 py-3 min-w-[12rem]">Learner</th>
                {grade.streams.length > 0 && <th className="px-4 py-3">Stream</th>}
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">%</th>
                <th className="px-4 py-3 text-center">Level</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grade.learners.length ? grade.learners.map((l) => {
                const expanded = expandedStudent === l.studentId
                return (
                  <LearnerRowGroup
                    key={l.studentId}
                    learner={l}
                    expanded={expanded}
                    grade={grade}
                    toggle={() => setExpandedStudent(expanded ? null : l.studentId)}
                    trends={trends}
                    trendLoading={trendLoading}
                  />
                )
              }) : (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">No learners found for this grade.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function LearnerRowGroup({ learner, expanded, grade, toggle, trends, trendLoading }: {
  learner: LearnerAnalysis
  expanded: boolean
  grade: GradeAnalysis
  toggle: () => void
  trends: Record<string, LearnerTrendScores[]>
  trendLoading: Record<string, boolean>
}) {
  const trend = trends[learner.studentId]
  const levelIndex = grade.levelDistribution.findIndex(l => l.grade === learner.overallLevel)
  return (
    <>
      <tr className="group hover:bg-slate-50/80 transition-colors">
        <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/80 transition-colors px-4 py-3 text-center">
          {learner.gradePosition !== null ? (
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">{learner.gradePosition}</span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="sticky left-14 z-10 bg-white group-hover:bg-slate-50/80 transition-colors px-4 py-3 font-mono text-xs font-semibold text-slate-600">{learner.admissionNo}</td>
        <td className="sticky left-[9.5rem] z-10 bg-white group-hover:bg-slate-50/80 transition-colors px-4 py-3 font-medium text-slate-900">{learner.fullName}</td>
        {grade.streams.length > 0 && <td className="px-4 py-3 text-xs font-semibold text-slate-500">{learner.streamName ?? '—'}</td>}
        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">{learner.total ?? '—'}</td>
        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-600">{learner.percent === null ? '—' : `${learner.percent.toFixed(1)}%`}</td>
        <td className="px-4 py-3 text-center">
          {learner.overallLevel ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-xs px-2.5 py-0.5 rounded-full" style={levelIndex >= 0 ? { background: `${levelColor(levelIndex)}22`, color: levelColor(levelIndex) } : undefined}>
              {learner.overallLevel}
            </span>
          ) : (
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">Incomplete</span>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <button type="button" onClick={toggle} className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors" aria-label={expanded ? 'Collapse learner detail' : 'Expand learner detail'}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/70">
          <td colSpan={grade.streams.length > 0 ? 8 : 7} className="px-6 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Learning Area Breakdown</p>
                <table className="w-full text-left text-xs text-slate-600">
                  <tbody className="divide-y divide-slate-100">
                    {learner.subjects.map(s => (
                      <tr key={s.subjectId}>
                        <td className="py-1.5 pr-2 font-semibold text-slate-800">{s.subjectName}</td>
                        <td className="py-1.5 pr-2 text-right font-mono font-semibold">{s.score === null ? 'ABS' : s.score.toFixed(2)}</td>
                        <td className="py-1.5 text-center">
                          {s.grade ? <span className="font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700" title={s.gradeDescription}>{s.grade}</span> : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Assessment Trend (overall %)</p>
                {trendLoading[learner.studentId] ? (
                  <p className="text-xs text-slate-500">Loading trend…</p>
                ) : trend && trend.length > 1 ? (
                  <div className="flex items-end gap-3 flex-wrap">
                    <Sparkline points={trend.map(t => t.percent)} showDot />
                    <ul className="space-y-1 text-[11px]">
                      {trend.slice(0, 6).map(t => (
                        <li key={t.examId} className="flex items-center gap-2 text-slate-600">
                          <span className="font-semibold text-slate-800">{t.examName}</span>
                          <span className="text-slate-400">·</span>
                          <span className="tabular-nums">{t.percent === null ? '—' : `${t.percent.toFixed(1)}%`}</span>
                          {t.position !== null ? <span className="text-slate-400">· Pos {t.position}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : trend && trend.length === 1 ? (
                  <p className="text-xs text-slate-500">Only one assessment recorded so far — add more assessments to see a trend.</p>
                ) : (
                  <p className="text-xs text-slate-500">Loading trend…</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}