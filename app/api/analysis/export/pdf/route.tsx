import { NextRequest } from 'next/server'
import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet, Svg, Path, Rect, Circle, Line, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { buildAssessmentAnalysis } from '@/lib/analysis'
import type { AssessmentAnalysisModel, AnalysisLevel, AnalysisLearningAreaResult, AnalysisRankRow, HistogramBin, TrendPoint } from '@/lib/analysis-types'
import { levelColor } from '@/lib/analysis-types'

export const runtime = 'nodejs'

// ---------------- Typography (Times New Roman family) ----------------
const F = {
  roman: 'Times-Roman',
  bold: 'Times-Bold',
  italic: 'Times-Italic',
  boldItalic: 'Times-BoldItalic',
}

const COLORS = {
  ink: '#1e293b',
  muted: '#64748b',
  faint: '#94a3b8',
  rule: '#cbd5e1',
  line: '#e2e8f0',
  headerBg: '#eef3f8',
  zebra: '#f8fafc',
}

const styles = StyleSheet.create({
  page: {
    fontFamily: F.roman,
    fontSize: 13,
    color: COLORS.ink,
    paddingHorizontal: 40, // ~1.4 cm side margins
    paddingTop: 66,
    paddingBottom: 46,
  },
  // repeating compact page header on continuation pages
  pageHeader: {
    position: 'absolute',
    top: 18,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    paddingBottom: 4,
    fontSize: 8.5,
    color: COLORS.muted,
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.6,
    borderTopColor: COLORS.line,
    paddingTop: 4,
    fontSize: 8.5,
    color: COLORS.faint,
  },
  // School header block
  schoolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  logo: { width: 52, height: 52, objectFit: 'contain', marginRight: 10 },
  schoolCenter: { alignItems: 'center' },
  schoolName: { fontFamily: F.bold, fontSize: 18, textAlign: 'center' },
  schoolMeta: { fontSize: 10.5, color: COLORS.muted, textAlign: 'center', marginTop: 2 },
  title: { fontFamily: F.bold, fontSize: 20, textAlign: 'center', letterSpacing: 1, marginTop: 8 },
  subtitle: { fontSize: 13, fontFamily: F.bold, textAlign: 'center', marginTop: 4, color: COLORS.ink },
  // Section headings
  sectionTitle: { fontFamily: F.bold, fontSize: 15, marginTop: 14, marginBottom: 6 },
  headingRule: { borderBottomWidth: 1, borderBottomColor: COLORS.rule, marginBottom: 8 },
  // KPI band
  kpiRow: { flexDirection: 'row', marginHorizontal: -5 },
  kpi: { flex: 1, marginHorizontal: 5, borderWidth: 1, borderColor: COLORS.rule, borderRadius: 4, padding: 8 },
  kpiLabel: { fontSize: 7.5, fontFamily: F.bold, color: COLORS.muted, letterSpacing: 0.4, marginBottom: 2 },
  kpiValue: { fontSize: 14, fontFamily: F.bold, color: COLORS.ink },
  kpiSub: { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  // Generic table
  th: { flexDirection: 'row', backgroundColor: COLORS.headerBg, fontFamily: F.bold, borderBottomWidth: 0.6, borderBottomColor: COLORS.rule },
  tr: { flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: COLORS.line },
  zebra: { backgroundColor: COLORS.zebra },
  cell: { paddingVertical: 3.5, paddingHorizontal: 4, fontSize: 10.5 },
  cellHeader: { paddingVertical: 4, paddingHorizontal: 4, fontSize: 10.5, fontFamily: F.bold },
  // Callout / coverage box
  callout: { borderWidth: 1, borderColor: '#fcd34d', backgroundColor: '#fffbeb', borderRadius: 4, padding: 7, marginBottom: 6, fontSize: 10, color: '#92400e' },
  calloutTitle: { fontFamily: F.bold, color: '#b45309', marginBottom: 2 },
  // Insights / recommendations lists
  li: { flexDirection: 'row', marginBottom: 3, fontSize: 11 },
  bullet: { width: 10, fontSize: 11 },
  liText: { flex: 1, fontSize: 11, lineHeight: 1.35 },
  // Small body text helper
  note: { fontSize: 9.5, color: COLORS.muted, marginTop: 4 },
  caption: { fontSize: 9.5, color: COLORS.faint, marginTop: 2 },
})

const fmt1 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n.toFixed(1)}`)
const fmt2 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${(Math.round(n * 100) / 100).toFixed(2)}`)

function levelBadgeText(code: string): string {
  return code && code !== '—' ? code : '—'
}

// ================= SVG chart components =================

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}
// SVG text styling (fontSize etc.) is supported at runtime but not in the TS
// SVGTextProps type, so route through createElement to bypass the check.
const SText = (props: Record<string, unknown>) => React.createElement(Text, props as any)
function donutSeg(cx: number, cy: number, rO: number, rI: number, start: number, end: number) {
  const large = end - start > 180 ? 1 : 0
  const [x1, y1] = polar(cx, cy, rO, start)
  const [x2, y2] = polar(cx, cy, rO, end)
  const [x3, y3] = polar(cx, cy, rI, end)
  const [x4, y4] = polar(cx, cy, rI, start)
  return `M ${x1} ${y1} A ${rO} ${rO} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rI} ${rI} 0 ${large} 0 ${x4} ${y4} Z`
}

function DoughnutSvg({ levels }: { levels: AnalysisLevel[] }) {
  const total = levels.reduce((s, l) => s + l.count, 0)
  const size = 150
  const cx = size / 2
  const cy = size / 2
  const rO = cx - 2
  const rI = rO - 26
  let angle = 0
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {total === 0
          ? <Circle cx={cx} cy={cy} r={(rO + rI) / 2} fill="none" stroke="#e2e8f0" strokeWidth={26} />
          : levels.map((lv) => {
              if (lv.count <= 0) return null
              const sweep = (lv.count / total) * 360
              const d = donutSeg(cx, cy, rO, rI, angle, angle + sweep)
              angle += sweep
              return <Path key={lv.code} d={d} fill={lv.color} stroke="#ffffff" strokeWidth={1} />
            })}
        <SText x={cx} y={cy - 2} textAnchor="middle" fontSize={18} fontFamily={F.bold} fill="#0f172a">{total}</SText>
        <SText x={cx} y={cy + 14} textAnchor="middle" fontSize={9} fill="#94a3b8">assessed</SText>
      </Svg>
      <View style={{ marginLeft: 12, flex: 1 }}>
        {levels.map((lv) => (
          <View key={lv.code} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: lv.color, marginRight: 5 }} />
            <Text style={{ width: 26, fontFamily: F.bold, fontSize: 10.5 }}>{lv.code}</Text>
            <Text style={{ flex: 1, fontSize: 9.5, color: COLORS.muted }}>{lv.description}</Text>
            <Text style={{ fontSize: 10, color: COLORS.ink }}>
              {lv.count}{lv.percentage !== null ? ` (${lv.percentage.toFixed(1)}%)` : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function areaColor(mean: number | null): string {
  if (mean === null) return '#94a3b8'
  if (mean >= 70) return '#15803d'
  if (mean >= 50) return '#d97706'
  return '#dc2626'
}

function LearningAreaBarSvg({ items }: { items: AnalysisLearningAreaResult[] }) {
  const valid = items.filter((i) => i.meanPercentage !== null).sort((a, b) => (a.meanPercentage ?? 0) - (b.meanPercentage ?? 0)).reverse()
  if (!valid.length) return null
  const labelW = 150
  const W = 500
  const H = 16 + valid.length * 24
  const trackW = W - labelW - 40
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {valid.map((item, i) => {
        const y = 8 + i * 24
        const pct = item.meanPercentage ?? 0
        const barW = Math.max(2, (pct / 100) * trackW)
        return (
          <React.Fragment key={item.subjectId}>
            <SText x={0} y={y + 13} fontSize={11} fill="#334155" fontFamily={F.bold}>{item.subjectName}</SText>
            <Rect x={labelW + 8} y={y} width={barW} height={15} rx={2.5} fill={areaColor(pct)} />
            <SText x={labelW + 8 + barW + 5} y={y + 12} fontSize={11} fill="#0f172a" fontFamily={F.bold}>{pct.toFixed(1)}%</SText>
          </React.Fragment>
        )
      })}
    </Svg>
  )
}

function HistogramSvg({ bins }: { bins: HistogramBin[] }) {
  const W = 500
  const H = 190
  const padL = 24
  const padB = 40
  const padT = 16
  const chartW = W - padL
  const chartH = H - padT - padB
  const maxCount = Math.max(1, ...bins.map((b) => b.count))
  const slot = chartW / bins.length
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {bins.map((bin, i) => {
        const x = padL + i * slot
        const barH = (bin.count / maxCount) * (chartH - 16)
        const y = padT + (chartH - barH)
        return (
          <React.Fragment key={bin.label}>
            <Rect x={x + 8} y={y} width={slot - 16} height={Math.max(2, barH)} rx={3} fill="#2563eb" />
            <SText x={x + slot / 2} y={y - 5} fontSize={11} fill="#0f172a" fontFamily={F.bold} textAnchor="middle">{bin.count}</SText>
            <SText x={x + slot / 2} y={H - 24} fontSize={10.5} fill="#475569" fontFamily={F.bold} textAnchor="middle">{bin.label}</SText>
            {bin.percentage !== null
              ? <SText x={x + slot / 2} y={H - 10} fontSize={9} fill="#94a3b8" textAnchor="middle">{bin.percentage.toFixed(1)}%</SText>
              : null}
          </React.Fragment>
        )
      })}
    </Svg>
  )
}

function TrendSvg({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return null
  const W = 500
  const H = 200
  const padL = 40
  const padR = 20
  const padT = 18
  const padB = 36
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const values = points.map((p) => p.percentage)
  const max = Math.ceil((Math.max(...values) + 5) / 10) * 10
  const min = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10)
  const span = max - min || 1
  const step = chartW / (points.length - 1)
  const coords = points.map((p, i) => ({ x: padL + i * step, y: padT + chartH - ((p.percentage - min) / span) * chartH }))
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {[min, max].map((tick, i) => {
        const y = padT + chartH - ((tick - min) / span) * chartH
        return (
          <React.Fragment key={i}>
            <Line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e2e8f0" strokeWidth={1} />
            <SText x={padL - 5} y={y + 3} fontSize={10} fill="#94a3b8" textAnchor="end">{tick}%</SText>
          </React.Fragment>
        )
      })}
      <Path d={coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')} fill="none" stroke="#059669" strokeWidth={3} strokeLinejoin="round" />
      {coords.map((c, i) => (
        <React.Fragment key={i}>
          <Circle cx={c.x} cy={c.y} r={3.5} fill="#059669" />
          <SText x={c.x} y={c.y - 9} fontSize={11} fill="#0f172a" fontFamily={F.bold} textAnchor="middle">{points[i].percentage.toFixed(1)}%</SText>
          <SText x={c.x} y={H - 14} fontSize={10.5} fill="#475569" fontFamily={F.bold} textAnchor="middle">{points[i].label}</SText>
        </React.Fragment>
      ))}
    </Svg>
  )
}

// ================= Section renderers =================

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{children}</Text>
      <View style={styles.headingRule} />
    </View>
  )
}

function RankingTable({ ranking }: { ranking: AnalysisRankRow[] }) {
  const col = { pos: { width: 46 }, adm: { width: 66 }, name: { flex: 1 }, total: { width: 52, textAlign: 'center' as const }, pct: { width: 56, textAlign: 'center' as const }, lvl: { width: 42, textAlign: 'center' as const } }
  return (
    <View wrap={false} style={{ marginTop: 2 }}>
      <View style={styles.th} fixed>
        <Text style={[styles.cellHeader, col.pos]}>Position</Text>
        <Text style={[styles.cellHeader, col.adm]}>Adm No</Text>
        <Text style={[styles.cellHeader, col.name]}>Learner</Text>
        <Text style={[styles.cellHeader, col.total]}>Total</Text>
        <Text style={[styles.cellHeader, col.pct]}>%</Text>
        <Text style={[styles.cellHeader, col.lvl]}>Level</Text>
      </View>
      {ranking.length === 0 && (
        <View style={styles.tr}><Text style={[styles.cell, col.name]}>No learners have complete assessment results for this scope.</Text></View>
      )}
      {ranking.map((l, idx) => (
        <View style={[styles.tr, ...(idx % 2 ? [styles.zebra] : [])]} wrap={false} key={l.studentId}>
          <Text style={[styles.cell, col.pos, { textAlign: 'center' }]}>{l.position}</Text>
          <Text style={[styles.cell, col.adm]}>{l.admissionNo || '—'}</Text>
          <Text style={[styles.cell, col.name]}>{l.fullName}</Text>
          <Text style={[styles.cell, col.total, { textAlign: 'center' }]}>{l.total}</Text>
          <Text style={[styles.cell, col.pct, { textAlign: 'center' }]}>{l.percentage.toFixed(1)}%</Text>
          <Text style={[styles.cell, col.lvl, { textAlign: 'center', color: levelBadgeText(l.overallLevel) === '—' ? COLORS.muted : levelColor(l.overallLevel) }]}>
            {levelBadgeText(l.overallLevel)}
          </Text>
        </View>
      ))}
    </View>
  )
}

function LearningAreaTable({ items }: { items: AnalysisLearningAreaResult[] }) {
  const col = { a: { flex: 1.3 }, mean: { width: 80, textAlign: 'center' as const }, hi: { flex: 1.2 }, hip: { width: 52, textAlign: 'center' as const }, lo: { flex: 1.2 }, lop: { width: 52, textAlign: 'center' as const } }
  return (
    <View wrap={false}>
      <View style={styles.th} fixed>
        <Text style={[styles.cellHeader, col.a]}>Learning Area</Text>
        <Text style={[styles.cellHeader, col.mean]}>Mean %</Text>
        <Text style={[styles.cellHeader, col.hi]}>Highest Learner</Text>
        <Text style={[styles.cellHeader, col.hip]}>Hi %</Text>
        <Text style={[styles.cellHeader, col.lo]}>Lowest Learner</Text>
        <Text style={[styles.cellHeader, col.lop]}>Lo %</Text>
      </View>
      {items.map((a, idx) => (
        <View style={[styles.tr, ...(idx % 2 ? [styles.zebra] : [])]} wrap={false} key={a.subjectId}>
          <Text style={[styles.cell, col.a]}>{a.subjectName}</Text>
          <Text style={[styles.cell, col.mean, { textAlign: 'center' }]}>
            {a.insufficient ? <Text style={{ color: '#b45309', fontFamily: F.bold }}>Insufficient</Text> : `${fmt1(a.meanPercentage)}%`}
          </Text>
          <Text style={[styles.cell, col.hi]}>{a.highestName ?? '—'}</Text>
          <Text style={[styles.cell, col.hip, { textAlign: 'center' }]}>{fmt1(a.highestScore)}</Text>
          <Text style={[styles.cell, col.lo]}>{a.lowestName ?? '—'}</Text>
          <Text style={[styles.cell, col.lop, { textAlign: 'center' }]}>{fmt1(a.lowestScore)}</Text>
        </View>
      ))}
    </View>
  )
}

// ================= Main document =================

function AnalysisPdf({ model }: { model: AssessmentAnalysisModel }) {
  const { scope, learningAreas, maxTotal, enrolledCount, assessedCount, coveragePercentage, classMeanPercentage, medianPercentage, standardDeviation, highestPercentage, lowestPercentage, topLearner, performanceDistribution, learningAreaResults, ranking, scoreDistribution, trend, anomalies, unassessedLearners, insights, recommendations, coverageWarning } = model

  const streamLine = [scope.gradeName, scope.streamName].filter(Boolean).join(' · ')
  const subtitle = [scope.examName, scope.term, scope.academicYear].filter(Boolean).join(' · ')
  const pageHeaderText = `${scope.schoolName} · Assessment Analysis · ${streamLine}`
  const generated = new Date(model.generatedAt)
  const genStr = generated.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Repeating compact header + footer */}
        <Text style={styles.pageHeader} fixed>{pageHeaderText}</Text>
        <View style={styles.footer} fixed>
          <Text>Generated by E-REPORTS · {genStr}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} fixed />
        </View>

        {/* School header */}
        <View style={styles.schoolCenter}>
          {scope.schoolLogoUrl ? (
            <View style={styles.schoolRow}>
              <Image src={scope.schoolLogoUrl} style={styles.logo} />
              <View>
                <Text style={styles.schoolName}>{scope.schoolName}</Text>
                <Text style={styles.schoolMeta}>
                  {scope.schoolAddress ? `P.O. Box ${scope.schoolAddress}` : ''}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.schoolName}>{scope.schoolName}</Text>
              <Text style={styles.schoolMeta}>
                {scope.schoolAddress ? `P.O. Box ${scope.schoolAddress}` : ''}
              </Text>
            </>
          )}
          <Text style={styles.title}>ASSESSMENT ANALYSIS</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Text style={{ ...styles.subtitle, fontSize: 11, fontFamily: F.roman, color: COLORS.muted, marginTop: 2 }}>{streamLine}</Text>
          {scope.classTeacherName ? <Text style={{ fontSize: 10, color: COLORS.muted, textAlign: 'center', marginTop: 3 }}>Class Teacher: {scope.classTeacherName}</Text> : null}
        </View>

        {/* KPI band */}
        <View style={{ ...styles.kpiRow, marginTop: 14 }}>
          <View style={[styles.kpi, { borderLeftColor: '#15803d', borderLeftWidth: 3 }]}>
            <Text style={styles.kpiLabel}>LEARNERS ASSESSED</Text>
            <Text style={styles.kpiValue}>{assessedCount} of {enrolledCount}</Text>
            <Text style={styles.kpiSub}>enrolled in scope</Text>
          </View>
          <View style={[styles.kpi, { borderLeftColor: '#2563eb', borderLeftWidth: 3 }]}>
            <Text style={styles.kpiLabel}>CLASS MEAN</Text>
            <Text style={styles.kpiValue}>{fmt1(classMeanPercentage)}%</Text>
            <Text style={styles.kpiSub}>of {assessedCount} assessed</Text>
          </View>
          <View style={[styles.kpi, { borderLeftColor: '#d97706', borderLeftWidth: 3 }]}>
            <Text style={styles.kpiLabel}>TOP LEARNER</Text>
            <Text style={styles.kpiValue}>{topLearner?.name ?? '—'}</Text>
            <Text style={styles.kpiSub}>{topLearner ? `${topLearner.total} · ${fmt1(topLearner.percentage)}%` : ''}</Text>
          </View>
          <View style={[styles.kpi, { borderLeftColor: '#7c3aed', borderLeftWidth: 3 }]}>
            <Text style={styles.kpiLabel}>LEARNING AREAS</Text>
            <Text style={styles.kpiValue}>{learningAreas.length}</Text>
            <Text style={styles.kpiSub}>max total {maxTotal}</Text>
          </View>
        </View>

        {/* Coverage callout */}
        {coverageWarning ? (
          <View style={styles.callout}>
            <Text style={styles.calloutTitle}>Data Coverage</Text>
            <Text>{coverageWarning}</Text>
          </View>
        ) : null}

        {/* Distribution + Class statistics */}
        <SectionTitle>Performance Level Distribution &amp; Class Statistics</SectionTitle>
        <View style={{ flexDirection: 'row', marginHorizontal: -5 }}>
          <View style={{ flex: 1, marginHorizontal: 5 }}>
            <DoughnutSvg levels={performanceDistribution} />
          </View>
          <View style={{ flex: 1, marginHorizontal: 5 }}>
            <ClassStatRow label="Mean %" value={`${fmt1(classMeanPercentage)}%`} />
            <ClassStatRow label="Median %" value={`${fmt1(medianPercentage)}%`} />
            <ClassStatRow label="Std Deviation" value={fmt1(standardDeviation)} />
            <ClassStatRow label="Highest %" value={`${fmt1(highestPercentage)}%`} />
            <ClassStatRow label="Lowest %" value={`${fmt1(lowestPercentage)}%`} />
            <ClassStatRow label="Data Coverage" value={`${fmt2(coveragePercentage)}%`} />
          </View>
        </View>
        <Text style={styles.note}>Statistics are computed from the {assessedCount} assessed learner(s). Learners with no complete recorded results are excluded and are not treated as failures.</Text>

        {/* Score distribution */}
        <SectionTitle>Score Distribution</SectionTitle>
        <HistogramSvg bins={scoreDistribution} />
        <Text style={styles.caption}>Distribution of the {assessedCount} assessed learners&apos; overall percentage across score bands.</Text>

        {/* Learning area performance */}
        <SectionTitle>Learning Area Performance</SectionTitle>
        <LearningAreaBarSvg items={learningAreaResults} />
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          <Legend color="#15803d" label="≥ 70%" />
          <Legend color="#d97706" label="50–69.9%" />
          <Legend color="#dc2626" label="< 50%" />
        </View>
        <Text style={{ ...styles.caption, marginTop: 6, marginBottom: 4 }}>Highest / lowest learner per Learning Area (assessed learners only):</Text>
        <LearningAreaTable items={learningAreaResults} />

        {/* Insights */}
        {insights.length > 0 ? (
          <>
            <SectionTitle>Automated Insights</SectionTitle>
            {insights.map((ins, i) => (
              <View style={styles.li} key={i}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.liText}>{ins.text}</Text>
              </View>
            ))}
          </>
        ) : null}

        {/* Trend */}
        {trend.length >= 2 ? (
          <>
            <SectionTitle>Performance Trend</SectionTitle>
            <TrendSvg points={trend} />
          </>
        ) : null}

        {/* Ranking */}
        <SectionTitle>Learner Ranking</SectionTitle>
        <Text style={styles.note}>Competition ranking over assessed learners only. Ties share a position; the next position skips the tied count. Unassessed learners are not ranked.</Text>
        <View style={{ marginTop: 4 }}>
          <RankingTable ranking={ranking} />
        </View>

        {/* Anomalies */}
        {anomalies.length > 0 ? (
          <>
            <SectionTitle>Data Quality / Anomalies</SectionTitle>
            {anomalies.map((a, i) => (
              <View style={styles.li} key={i}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.liText}>
                  <Text style={{ fontFamily: F.bold }}>{a.learnerName}</Text>
                  {' '}({a.admissionNo}) — {a.reason}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        {/* Recommendations */}
        {recommendations.length > 0 ? (
          <>
            <SectionTitle>Recommendations</SectionTitle>
            {recommendations.map((r, i) => (
              <View style={styles.li} key={i}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.liText}>
                  <Text style={{ fontFamily: F.bold }}>{r.category}: </Text>
                  {r.text}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        {/* Unassessed appendix */}
        {unassessedLearners.length > 0 ? (
          <>
            <SectionTitle>Appendix — Learners Not Yet Assessed</SectionTitle>
            <Text style={styles.note}>
              {unassessedLearners.length} enrolled learner(s) have no complete recorded assessment result. They are listed here for follow-up only; they have no performance level and are never counted as 0%.
            </Text>
            <View style={{ marginTop: 4 }}>
              <View style={styles.th} fixed>
                <Text style={[styles.cellHeader, { width: 66 }]}>Adm No</Text>
                <Text style={[styles.cellHeader, { flex: 1 }]}>Learner</Text>
              </View>
              {unassessedLearners.map((l, idx) => (
                <View style={[styles.tr, ...(idx % 2 ? [styles.zebra] : [])]} wrap={false} key={l.studentId}>
                  <Text style={[styles.cell, { width: 66 }]}>{l.admissionNo || '—'}</Text>
                  <Text style={[styles.cell, { flex: 1 }]}>{l.fullName}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </Page>
    </Document>
  )
}

function ClassStatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.4, borderBottomColor: COLORS.line, paddingVertical: 4 }}>
      <Text style={{ fontSize: 10.5, color: COLORS.muted }}>{label}</Text>
      <Text style={{ fontSize: 10.5, fontFamily: F.bold, color: COLORS.ink }}>{value}</Text>
    </View>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, marginRight: 4 }} />
      <Text style={{ fontSize: 9.5, color: COLORS.muted }}>{label}</Text>
    </View>
  )
}

// ================= Route =================

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return new Response('No school linked', { status: 403 })
  const throttled = limitAuthenticatedRoute(request.headers, user.id, 'export-analysis-pdf', 30)
  if (throttled) return throttled

  const url = new URL(request.url)
  const examId = url.searchParams.get('exam')?.trim()
  const classId = url.searchParams.get('class')?.trim()
  const streamId = url.searchParams.get('stream')?.trim() || undefined
  if (!examId) return new Response('exam is required', { status: 400 })
  if (!classId) return new Response('class is required', { status: 400 })

  const model = await buildAssessmentAnalysis({ examId, classId, streamId })
  if ('error' in model) return new Response(model.error, { status: 400 })

  const pdf = await renderToBuffer(<AnalysisPdf model={model} />)

  const safeExam = model.scope.examName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'assessment'

  return new Response(pdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="analysis-${safeExam}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
