import React from 'react'

export function KpiCard({ label, value, sub, accent = '#059669' }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
      </div>
      <p className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2 tabular-nums">{value}</p>
      {sub ? <p className="text-xs font-medium text-slate-500 mt-1.5 truncate">{sub}</p> : null}
    </div>
  )
}

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

export function Donut({ items, size = 150, thickness = 24, centerLabel, centerSub }: { items: { label: string; value: number; color: string }[]; size?: number; thickness?: number; centerLabel?: string; centerSub?: string }) {
  const total = items.reduce((sum, i) => sum + i.value, 0)
  const cx = size / 2
  const cy = size / 2
  const rOuter = cx - 2
  const rInner = rOuter - thickness
  let angle = 0

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution donut">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="#e2e8f0" strokeWidth={thickness} />
        ) : (
          items.map((item) => {
            if (item.value <= 0) return null
            const sweep = (item.value / total) * 360
            const path = donutSegment(cx, cy, rOuter, rInner, angle, angle + sweep)
            angle += sweep
            return <path key={item.label} d={path} fill={item.color} stroke="white" strokeWidth={1.5} />
          })
        )}
        {centerLabel !== undefined && (
          <>
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize={size / 7.5} fontWeight={800} fill="#0f172a">
              {centerLabel}
            </text>
            {centerSub ? (
              <text x={cx} y={cy + size / 11} textAnchor="middle" fontSize={size / 16} fill="#94a3b8">
                {centerSub}
              </text>
            ) : null}
          </>
        )}
      </svg>
      {items.some(i => i.value > 0) && (
        <ul className="space-y-1.5 min-w-0">
          {items.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: item.color }} />
              <span className="font-semibold text-slate-700 min-w-0 truncate">{item.label}</span>
              <span className="text-slate-400">·</span>
              <span className="font-bold text-slate-900 tabular-nums">{item.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function BarList({ items, max }: { items: { label: string; value: number; color?: string; hint?: string }[]; max?: number }) {
  const ceiling = max ?? Math.max(1, ...items.map(i => i.value))
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex items-center justify-between gap-3 text-xs mb-1">
            <span className="font-semibold text-slate-700 truncate" title={item.label}>{item.label}</span>
            <span className="font-bold text-slate-900 tabular-nums">{item.value}{item.hint ? <span className="text-slate-400 font-medium ml-1">{item.hint}</span> : null}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, (item.value / ceiling) * 100)}%`, background: item.color ?? '#059669' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ColumnChart({ items, height = 180, color = '#059669', suffix = '' }: { items: { label: string; value: number }[]; height?: number; color?: string; suffix?: string }) {
  const ceiling = Math.max(1, ...items.map(i => i.value))
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {items.map((item) => (
        <div key={item.label} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${item.label}: ${item.value}${suffix}`}>
          <span className="text-[10px] font-bold text-slate-700 tabular-nums">{item.value}</span>
          <div className="w-full rounded-t-lg" style={{ height: `${Math.max(4, (item.value / ceiling) * (height - 44))}px`, background: color, minWidth: 8 }} />
          <span className="text-[10px] font-semibold text-slate-500 truncate w-full text-center">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

export function Sparkline({ points, width = 140, height = 36, color = '#059669', showDot = false }: { points: (number | null)[]; width?: number; height?: number; color?: string; showDot?: boolean }) {
  const valid = points.map((p, i) => (p === null ? null : { x: i, y: p })).filter((p): p is { x: number; y: number } => p !== null)
  if (valid.length < 2) {
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend sparkline"><path d={`M 4 ${height / 2} H ${width - 4}`} stroke="#e2e8f0" strokeWidth={2} strokeDasharray="3 3" /></svg>
  }
  const min = Math.min(...valid.map(p => p.y))
  const max = Math.max(...valid.map(p => p.y))
  const span = max - min || 1
  const step = (width - 8) / (points.length - 1)
  const coords = points.map((p, i) => (p === null ? null : { x: 4 + i * step, y: 4 + (height - 8) * (1 - (p - min) / span) }))
  const line = coords.filter((c): c is { x: number; y: number } => c !== null).map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
  const area = valid.filter(c => c !== null)
  const last = area[area.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend sparkline">
      <path d={`${line} L ${last.x} ${height - 4} L 4 ${height - 4} Z`} fill={color} opacity={0.08} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {showDot && last ? <circle cx={last.x} cy={last.y} r={3} fill={color} /> : null}
    </svg>
  )
}