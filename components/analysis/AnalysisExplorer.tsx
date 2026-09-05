'use client'

import React from 'react'
import { Award, BarChart3, FileDown, AlertTriangle, BookOpen, GraduationCap, Info, TrendingUp, Users, Gauge } from 'lucide-react'
import { CbcDonut, LearningAreaBarChart, LearningAreaLevelBars, ScoreHistogram, TrendLineChart } from './charts'
import { levelColor, type AssessmentAnalysisModel } from '@/lib/analysis-types'

const f1 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toFixed(1))

function LevelBadge({ code }: { code: string }) {
  if (!code || code === '—') return <span className="text-xs font-semibold text-slate-400 px-2 py-0.5 rounded-full bg-slate-100">—</span>
  const color = levelColor(code)
  return (
    <span className="inline-flex items-center font-bold text-xs px-2.5 py-0.5 rounded-full" style={{ background: `${color}1a`, color }}>
      {code}
    </span>
  )
}

export default function AnalysisExplorer({ analysis, streamId }: { analysis: AssessmentAnalysisModel; streamId?: string }) {
  const { scope } = analysis
  const sub = [scope.examName, scope.term, scope.academicYear, scope.gradeName, scope.streamName].filter(Boolean).join(' · ')

  const pdfHref = `/api/analysis/export/pdf?exam=${scope.examId}&class=${scope.gradeId}${streamId ? `&stream=${streamId}` : ''}`

  return (
    <div className="space-y-6">
      {/* School header */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {scope.schoolLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={scope.schoolLogoUrl} alt="School logo" className="h-14 w-14 rounded-full object-cover border border-slate-200" />
            ) : null}
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{scope.schoolName}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {scope.schoolAddress ? `P.O. Box ${scope.schoolAddress}` : ''}
                {scope.classTeacherName ? <span className="ml-1">· Grade Class Teacher: {scope.classTeacherName}</span> : null}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-extrabold text-slate-900 tracking-wide">ASSESSMENT ANALYSIS</p>
            <p className="text-sm font-semibold text-slate-500 mt-0.5">{sub}</p>
            <a href={pdfHref} download className="btn mt-3 min-h-10 py-1.5 px-3">
              <FileDown className="h-4 w-4" /> Download PDF
            </a>
          </div>
        </div>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Learners Assessed" value={`${analysis.assessedCount} of ${analysis.enrolledCount}`} sub="enrolled in scope" accent="#15803d" />
        <KpiCard label="Grade Mean" value={`${f1(analysis.classMeanPercentage)}%`} sub={`of ${analysis.assessedCount} assessed`} accent="#2563eb" />
        <KpiCard label="Top Learner" value={analysis.topLearner?.name ?? '—'} sub={analysis.topLearner ? `${analysis.topLearner.total} · ${f1(analysis.topLearner.percentage)}%` : undefined} accent="#d97706" />
        <KpiCard label="Learning Areas" value={`${analysis.learningAreas.length}`} sub={`max total ${analysis.maxTotal}`} accent="#7c3aed" />
      </div>

      {/* Coverage warning */}
      {analysis.coverageWarning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">{analysis.coverageWarning}</p>
        </div>
      ) : null}

      {/* Performance distribution + class statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2"><Gauge className="h-4 w-4 text-emerald-600" /> Performance Level Distribution</h4>
          <CbcDonut levels={analysis.performanceDistribution} />
        </section>
        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-emerald-600" /> Grade Statistics</h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Stat label="Mean %" value={`${f1(analysis.classMeanPercentage)}%`} />
            <Stat label="Median %" value={`${f1(analysis.medianPercentage)}%`} />
            <Stat label="Std Deviation" value={f1(analysis.standardDeviation)} />
            <Stat label="Highest %" value={`${f1(analysis.highestPercentage)}%`} />
            <Stat label="Lowest %" value={`${f1(analysis.lowestPercentage)}%`} />
            <Stat label="Data Coverage" value={`${f1(analysis.coveragePercentage)}%`} />
          </dl>
        </section>
      </div>

      {/* Score distribution */}
      <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
        <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-emerald-600" /> Score Distribution</h4>
        <ScoreHistogram bins={analysis.scoreDistribution} />
        <p className="text-[11px] text-slate-400 mt-2">Distribution of the {analysis.assessedCount} assessed learners&apos; overall percentages.</p>
      </section>

      {/* Learning area performance */}
      <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
        <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2"><BookOpen className="h-4 w-4 text-emerald-600" /> Learning Area Performance</h4>
        {analysis.learningAreas.length === 0 ? (
          <p className="text-sm text-slate-500">No learning areas are configured for this Assessment and Grade.</p>
        ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Mean % by Learning Area</p>
              <LearningAreaBarChart items={analysis.learningAreaResults} />
              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-700" /> ≥ 70%</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-600" /> 50–69.9%</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-600" /> &lt; 50%</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 mb-2">Learning Area Analysis</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 min-w-[30rem]">
                  <thead className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-2">Learning Area</th>
                      <th className="py-2 pr-2 text-right">Mean %</th>
                      <th className="py-2 pr-2">Highest</th>
                      <th className="py-2 pr-2 text-right">Hi %</th>
                      <th className="py-2 pr-2">Lowest</th>
                      <th className="py-2 text-right">Lo %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.learningAreaResults.map((a) => (
                      <tr key={a.subjectId}>
                        <td className="py-2 pr-2 font-semibold text-slate-800">{a.subjectName}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{a.insufficient ? <span className="text-amber-600 font-semibold">Insufficient data</span> : `${f1(a.meanPercentage)}%`}</td>
                        <td className="py-2 pr-2">{a.highestName ?? '—'}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{a.highestScore ?? '—'}</td>
                        <td className="py-2 pr-2">{a.lowestName ?? '—'}</td>
                        <td className="py-2 text-right tabular-nums">{a.lowestScore ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
        </div>
        <div className="mt-8">
          <p className="text-xs font-semibold text-slate-500 mb-2">Level Distribution by Learning Area</p>
          <LearningAreaLevelBars items={analysis.learningAreaResults} />
        </div>
        </>
      )}
    </section>

      {/* Insights */}
      {analysis.insights.length > 0 ? (
        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><Info className="h-4 w-4 text-emerald-600" /> Automated Insights</h4>
          <ul className="space-y-2">
            {analysis.insights.map((ins, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${ins.kind === 'weakness' ? 'bg-red-500' : ins.kind === 'strength' ? 'bg-green-600' : 'bg-sky-500'}`} />
                <span className="leading-relaxed">{ins.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Trend */}
      {analysis.trend.length >= 2 ? (
        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> Performance Trend</h4>
          <TrendLineChart points={analysis.trend} />
        </section>
      ) : null}

      {/* Ranking */}
      <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 pb-3 flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Award className="h-4 w-4 text-emerald-600" /> Learner Ranking</h4>
          <p className="text-[11px] text-slate-400">Assessed learners only · competition ranking (ties share a position, next skips)</p>
        </div>
        <div className="table-rail">
          <table className="w-full text-left text-sm text-slate-600 min-w-[40rem]">
            <thead className="bg-slate-50 border-y border-slate-200 text-[11px] uppercase tracking-wider font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3 w-14 text-center">Position</th>
                <th className="px-4 py-3 w-24">Adm No</th>
                <th className="px-4 py-3">Learner</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">%</th>
                <th className="px-4 py-3 text-center">Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analysis.ranking.length ? analysis.ranking.map((l, idx) => (
                <tr key={l.studentId} className={idx % 2 ? 'bg-slate-50/60' : 'bg-white'}>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">{l.position}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-600">{l.admissionNo}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{l.fullName}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-800">{l.total}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-600">{l.percentage.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-center"><LevelBadge code={l.overallLevel} /></td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">No learners have complete assessment results for this scope.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Anomalies */}
      {analysis.anomalies.length > 0 ? (
        <section className="rounded-2xl bg-white border border-amber-200/70 shadow-sm p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Data Quality / Anomalies</h4>
          <ul className="space-y-2">
            {analysis.anomalies.map((a, i) => (
              <li key={i} className="text-sm text-slate-700 flex flex-wrap gap-2">
                <span className="font-bold text-slate-900">{a.learnerName}</span>
                <span className="text-slate-400">({a.admissionNo})</span>
                <span className="text-slate-600">— {a.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Recommendations */}
      {analysis.recommendations.length > 0 ? (
        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><GraduationCap className="h-4 w-4 text-emerald-600" /> Recommendations</h4>
          <ul className="space-y-2">
            {analysis.recommendations.map((r, i) => (
              <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-600 shrink-0" />
                <span className="leading-relaxed"><span className="font-bold text-slate-800">{r.category}:</span> {r.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Unassessed appendix */}
      {analysis.unassessedLearners.length > 0 ? (
        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Users className="h-4 w-4 text-slate-500" /> Appendix — Learners Not Yet Assessed</h4>
            <span className="text-xs text-slate-500">{analysis.unassessedLearners.length} enrolled learner(s) have no complete recorded result</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 min-w-[30rem]">
              <thead className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2 pr-2 w-24">Adm No</th>
                  <th className="py-2">Learner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analysis.unassessedLearners.map((l) => (
                  <tr key={l.studentId}>
                    <td className="py-2 pr-2 font-mono text-xs">{l.admissionNo}</td>
                    <td className="py-2">{l.fullName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-400 mt-2">These learners are excluded from all performance calculations and are not assigned a performance level.</p>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
      </div>
      <p className="text-2xl font-extrabold text-slate-900 tracking-tight mt-2 tabular-nums break-words">{value}</p>
      {sub ? <p className="text-xs font-medium text-slate-500 mt-1.5 truncate">{sub}</p> : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-extrabold text-slate-900 tabular-nums">{value}</dd>
    </div>
  )
}
