'use client'

import React from 'react'
import type { AnalysisLevel, AnalysisLearningAreaResult, HistogramBin, TrendPoint } from '@/lib/analysis-types'

// ---------- Doughnut (performance level distribution) ----------
function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function donutSegment(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number) {
  const large = end - start > 180 ? 1 : 0
  const [x1, y1] = polar(cx, cy, rOuter, start)
  const [x2, y2] = polar(cx, cy, rOuter, end)
  const [x3, y3] = polar(cx, cy, rInner, end)
  const [x4, y4] = polar(cx, cy, rInner, start)
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`
}

export function CbcDonut({ levels, size = 160, thickness = 28 }: { levels: AnalysisLevel[]; size?: number; thickness?: number }) {
  const total = levels.reduce((s, l) => s + l.count, 0)
  const cx = size / 2
  const cy = size / 2
  const rOuter = cx - 2
  const rInner = rOuter - thickness
  let angle = 0

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Performance level distribution">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} fill="none" stroke="#e2e8f0" strokeWidth={thickness} />
        ) : (
          levels.map((level) => {
            if (level.count <= 0) return null
            const sweep = (level.count / total) * 360
            const path = donutSegment(cx, cy, rOuter, rInner, angle, angle + sweep)
            angle += sweep
            return <path key={level.code} d={path} fill={level.color} stroke="#ffffff" strokeWidth={1.5} />
          })
        )}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={size / 8} fontWeight={800} fill="#0f172a">
          {total}
        </text>
        <text x={cx} y={cy + size / 12} textAnchor="middle" fontSize={size / 18} fill="#94a3b8">
          assessed
        </text>
      </svg>
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
  const valid = items.filter((i) => i.meanPercentage !== null).sort((a, b) => (a.meanPercentage ?? 0) - (b.meanPercentage ?? 0)).reverse()
  const height = Math.max(60, valid.length * 34)
  const width = 620
  const labelW = 150
  const valW = 70
  const barMax = 100

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width, minWidth: 420 }} role="img" aria-label="Learning area averages">
        {valid.map((item, i) => {
          const y = 14 + i * 34
          const pct = item.meanPercentage ?? 0
          const trackW = width - labelW - valW
          const barW = Math.max(2, (pct / barMax) * (trackW - 12))
          return (
            <g key={item.subjectId}>
              <text x={0} y={y + 12} fontSize={12} fill="#334155" fontWeight={600} textAnchor="start">
                {item.subjectName}
              </text>
              <rect x={labelW + 8} y={y} width={barW} height={18} rx={3} fill={areaColor(pct)} />
              <text x={labelW + 8 + barW + 6} y={y + 13} fontSize={12} fill="#0f172a" fontWeight={700} textAnchor="start">
                {pct.toFixed(1)}%
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ---------- Score distribution histogram ----------
export function ScoreHistogram({ bins }: { bins: HistogramBin[] }) {
  const width = 620
  const height = 220
  const padL = 30
  const padB = 34
  const padT = 12
  const chartW = width - padL
  const chartH = height - padT - padB
  const maxCount = Math.max(1, ...bins.map((b) => b.count))
  const slot = chartW / bins.length

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width, minWidth: 420 }} role="img" aria-label="Score distribution">
        {bins.map((bin, i) => {
          const x = padL + i * slot
          const barH = (bin.count / maxCount) * (chartH - 14)
          const y = padT + (chartH - barH)
          return (
            <g key={bin.label}>
              <rect x={x + 8} y={y} width={slot - 16} height={Math.max(2, barH)} rx={3} fill="#2563eb" />
              <text x={x + slot / 2} y={y - 6} fontSize={12} fill="#0f172a" fontWeight={700} textAnchor="middle">
                {bin.count}
              </text>
              <text x={x + slot / 2} y={height - 14} fontSize={11.5} fill="#475569" fontWeight={600} textAnchor="middle">
                {bin.label}
              </text>
              {bin.percentage !== null ? (
                <text x={x + slot / 2} y={height - 2} fontSize={10} fill="#94a3b8" textAnchor="middle">
                  {bin.percentage.toFixed(1)}%
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ---------- Performance trend line chart ----------
export function TrendLineChart({ points }: { points: TrendPoint[] }) {
  const width = 620
  const height = 220
  const padL = 40
  const padR = 20
  const padT = 14
  const padB = 34
  const chartW = width - padL - padR
  const chartH = height - padT - padB

  if (points.length < 2) {
    return <p className="text-sm text-slate-500">Not enough comparable assessment points to plot a trend.</p>
  }

  const values = points.map((p) => p.percentage)
  const max = Math.ceil((Math.max(...values) + 5) / 10) * 10
  const min = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10)
  const span = max - min || 1
  const step = chartW / (points.length - 1)
  const coords = points.map((p, i) => ({ x: padL + i * step, y: padT + chartH - ((p.percentage - min) / span) * chartH }))

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width, minWidth: 420 }} role="img" aria-label="Performance trend">
        {[min, max].map((tick, i) => {
          const y = padT + chartH - ((tick - min) / span) * chartH
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padL - 6} y={y + 4} fontSize={11} fill="#94a3b8" textAnchor="end">
                {tick}%
              </text>
            </g>
          )
        })}
        <path d={coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')} fill="none" stroke="#059669" strokeWidth={3} strokeLinejoin="round" />
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={4} fill="#059669" />
            <text x={c.x} y={c.y - 10} fontSize={11.5} fill="#0f172a" fontWeight={700} textAnchor="middle">
              {points[i].percentage.toFixed(1)}%
            </text>
            <text x={c.x} y={height - 14} fontSize={11} fill="#475569" fontWeight={600} textAnchor="middle">
              {points[i].label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
