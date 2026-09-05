'use client'

import React from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  LabelList,
} from 'recharts'
import type { AnalysisLevel, AnalysisLearningAreaResult, HistogramBin, TrendPoint } from '@/lib/analysis-types'

const tooltipContentStyle: React.CSSProperties = {
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  boxShadow: '0 6px 16px -6px rgba(15,23,42,0.12)',
}
const tooltipLabelStyle: React.CSSProperties = { fontWeight: 700, color: '#0f172a' }

// ---------- Doughnut (performance level distribution) ----------
export function CbcDonut({ levels }: { levels: AnalysisLevel[]; size?: number; thickness?: number }) {
  const total = levels.reduce((s, l) => s + l.count, 0)
  const data = levels.filter((l) => l.count > 0)
  const hasData = total > 0 && data.length > 0

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative h-40 w-40 shrink-0">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="count" nameKey="code" innerRadius={54} outerRadius={78} paddingAngle={2} stroke="#ffffff" strokeWidth={2}>
                {data.map((level) => <Cell key={level.code} fill={level.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} formatter={(rawValue, rawName) => { const value = typeof rawValue === 'number' ? rawValue : 0; return [`${value} learner${value === 1 ? '' : 's'}`, String(rawName ?? '')] }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full border-[22px] border-slate-100 text-slate-400">0</div>
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-slate-900 tabular-nums">{total}</span>
          <span className="text-[10px] font-medium text-slate-400">assessed</span>
        </div>
      </div>
      <ul className="space-y-1.5 min-w-0 flex-1">
        {levels.map((level) => (
          <li key={level.code} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: level.color }} />
            <span className="font-semibold text-slate-700 min-w-[2.2rem]">{level.code}</span>
            <span className="text-slate-400 truncate">{level.description}</span>
            <span className="ml-auto font-bold text-slate-900 tabular-nums">
              {level.count}
              {level.percentage !== null ? <span className="text-slate-400 font-medium ml-1">({level.percentage.toFixed(1)}%)</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- Horizontal learning-area bar chart (sorted, coloured) ----------
function areaColor(mean: number | null): string {
  if (mean === null) return '#94a3b8'
  if (mean >= 70) return '#15803d'
  if (mean >= 50) return '#d97706'
  return '#dc2626'
}

export function LearningAreaBarChart({ items }: { items: AnalysisLearningAreaResult[] }) {
  const valid = items
    .filter((i) => i.meanPercentage !== null)
    .map((i) => ({ name: i.subjectName, mean: Math.round((i.meanPercentage ?? 0) * 10) / 10, fill: areaColor(i.meanPercentage) }))
    .sort((a, b) => a.mean - b.mean)

  if (!valid.length) return <p className="text-sm text-slate-500">No learning-area averages available.</p>

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[420px]">
        <ResponsiveContainer width="100%" height={Math.max(140, valid.length * 42)}>
          <BarChart data={valid} layout="vertical" margin={{ top: 4, right: 46, left: 8, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="#eef2f7" />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} formatter={(rawValue) => [`${typeof rawValue === 'number' ? rawValue : 0}%`, 'Mean']} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="mean" radius={[0, 4, 4, 0]} barSize={18}>
              {valid.map((row) => <Cell key={row.name} fill={row.fill} />)}
              <LabelList dataKey="mean" position="right" formatter={(v) => `${typeof v === 'number' ? v : ''}%`} style={{ fontSize: 11, fill: '#0f172a', fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ---------- Per-learning-area level distribution (stacked horizontal) ----------
const PER_LEVEL_BAR_HEIGHT = 180

export function LearningAreaLevelBars({ items }: { items: AnalysisLearningAreaResult[] }) {
  const areas = items.filter((a) => !a.insufficient)
  if (!areas.length) return <p className="text-sm text-slate-500">No level distributions available.</p>

  const chartData = areas.map((area) => {
    const row: Record<string, string | number> = { name: area.subjectName }
    for (const l of area.distribution) row[l.code] = l.count
    return row
  })
  const levels = areas[0]?.distribution ?? []

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[560px]">
        <ResponsiveContainer width="100%" height={Math.max(140, areas.length * PER_LEVEL_BAR_HEIGHT)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }} stackOffset="sign">
            <CartesianGrid horizontal={false} stroke="#eef2f7" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              cursor={{ fill: 'rgba(148,163,184,0.08)' }}
              formatter={(rawValue, rawName, rawEntry) => {
                const name = String(rawName ?? '')
                const entry = rawEntry as { payload?: Record<string, unknown> } | undefined
                const count = Number((entry?.payload?.[name] as number | undefined) ?? 0)
                return [`${count}`, name]
              }}
            />
            {levels.map((level) => (
              <Bar key={level.code} dataKey={level.code} stackId="levels" fill={level.color} name={level.description} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ---------- Score distribution histogram ----------
export function ScoreHistogram({ bins }: { bins: HistogramBin[] }) {
  const data = bins.map((b) => ({ name: b.label, count: b.count, percentage: b.percentage }))
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[420px]">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11.5, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} formatter={(rawValue) => { const value = typeof rawValue === 'number' ? rawValue : 0; return [`${value} learner${value === 1 ? '' : 's'}`, 'Count'] }} cursor={{ fill: 'rgba(59,130,246,0.06)' }} />
            <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: '#0f172a', fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ---------- Performance trend line chart ----------
export function TrendLineChart({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return <p className="text-sm text-slate-500">Not enough comparable assessment points to plot a trend.</p>
  const data = points.map((p) => ({ name: p.label, percentage: Math.round(p.percentage * 10) / 10 }))
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[420px]">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis domain={['auto', 'auto']} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} formatter={(rawValue) => [`${typeof rawValue === 'number' ? rawValue : 0}%`, 'Mean']} />
            <Line type="monotone" dataKey="percentage" stroke="#059669" strokeWidth={3} dot={{ r: 4, fill: '#059669', strokeWidth: 2, stroke: '#ffffff' }} activeDot={{ r: 6 }}>
              <LabelList dataKey="percentage" position="top" formatter={(v) => `${typeof v === 'number' ? v : ''}%`} style={{ fontSize: 11, fill: '#0f172a', fontWeight: 700 }} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}