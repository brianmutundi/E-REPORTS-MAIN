import { createClient } from '@/lib/supabase/server'

/**
 * Mode-aware configurable CBE grading (spec docs/grading-system-spec.md).
 *
 * Two grading modes:
 *   '4' -> EE / ME / AE / BE
 *   '8' -> EE1/EE2, ME1/ME2, AE1/AE2, BE1/BE2
 *
 * Level matching uses a closed-open boundary rule per spec §6:
 *   min ≤ score < next.min  (the top level is closed on both ends at 100),
 * so no percentage is ambiguous or double-counted.
 *
 * Achievement levels are CALCULATED from the active configuration at read time;
 * the `marks` table stores only raw numeric scores and is never rewritten.
 */

export const GRADING_SCALE = [
  { grade: 'EE', min: 80, max: 100, description: 'Exceeding Expectation' },
  { grade: 'ME', min: 60, max: 79.99, description: 'Meeting Expectation' },
  { grade: 'AE', min: 40, max: 59.99, description: 'Approaching Expectation' },
  { grade: 'BE', min: 0, max: 39.99, description: 'Below Expectation' },
] as const

export type GradeRule = {
  grade: string
  min: number
  max: number
  description: string
  sort_order?: number
  /** 8-level KNEC points; null for 4-level. */
  points?: number | null
  /** Broad CBE category (EE/ME/AE/BE) for 8-level aggregation. */
  broad?: string | null
  /** Display name from the active configuration. */
  name?: string
  /** Colour used for charts / badges (mode-aware). */
  color?: string
}

export type GradingMode = '4' | '8'

export type GradingConfig = {
  mode: GradingMode
  levels: GradeRule[]
}

/**
 * The single authoritative level matcher (spec §10).
 *
 * Closed-open on the low side held                                                 : if a level owns [min, max]
 * this matcher iterates the scale sorted by min ascending and returns the FIRST
 * level whose range contains the percentage, where each level (except the top) is
 * treated as [min, next.min). This makes adjacent-boundary values unambiguous.
 */
export function calculateAchievement(percentage: number, levels: readonly GradeRule[]): GradeRule | undefined {
  if (!Number.isFinite(percentage)) return undefined
  const sorted = [...levels].sort((a, b) => a.min - b.min)
  for (let i = 0; i < sorted.length; i++) {
    const level = sorted[i]
    const next = sorted[i + 1]
    if (next) {
      // closed on min, open on the next level's min (spec §6)
      if (percentage >= level.min && percentage < next.min) return level
    } else {
      // top level: closed on both ends at 100
      if (percentage >= level.min && percentage <= level.max) return level
    }
  }
  return undefined
}

export function getGrade(score: number, scale: readonly GradeRule[] = GRADING_SCALE) {
  const rule = calculateAchievement(score, scale) ?? getGradeRule(score, scale)
  return rule?.grade ?? ''
}

export function getGradeDescription(score: number, scale: readonly GradeRule[] = GRADING_SCALE) {
  const rule = calculateAchievement(score, scale) ?? getGradeRule(score, scale)
  return rule?.description ?? ''
}

/** The grading rule matching a numeric score. Returns undefined when no range matches. */
export function getGradeRule(score: number, scale: readonly GradeRule[] = GRADING_SCALE) {
  const sorted = [...scale].sort((a, b) => a.min - b.min)
  return sorted.find(r => score >= r.min && score <= r.max)
}

/**
 * Single source of truth for "was this learner assessed on this learning area?"
 * Only a finite numeric value counts. A genuine zero (0) is assessed; a blank
 * or null means absent / no score recorded and is NEVER treated as zero.
 */
export function isAssessed(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * TOTAL = sum of the learner's valid numeric learning-area scores.
 * Blank/null scores never inflate or reduce the total.
 */
export function computeTotal(values: readonly (number | null | undefined)[]): number {
  let sum = 0
  for (const v of values) {
    if (isAssessed(v)) sum += v
  }
  return sum
}

/** The applicable maximum total for an assessment = sum of each learning area maximum. */
export function computeTotalMaximum(maxScores: readonly number[]): number {
  return maxScores.reduce((sum, m) => sum + (Number.isFinite(m) ? m : 0), 0)
}

/** Percentage score against a maximum, guarded against zero/negative maxima. */
export function computePercent(value: number, maximum: number): number {
  if (!isAssessed(value) || maximum <= 0) return 0
  return (value / maximum) * 100
}

/**
 * Overall Performance Level derived from the TOTAL numeric result.
 * The configured grading scale is percentage based (0–100), so the total is
 * normalised against the assessment's dynamically derived total maximum and
 * matched against the same configurable scale used for learning areas.
 */
export function getOverallLevel(total: number | null, totalMaximum: number, scale: readonly GradeRule[] = GRADING_SCALE): string {
  if (total === null || !isAssessed(total) || totalMaximum <= 0) return ''
  return getGrade(computePercent(total, totalMaximum), scale)
}

export function getOverallDescription(total: number | null, totalMaximum: number, scale: readonly GradeRule[] = GRADING_SCALE): string {
  if (total === null || !isAssessed(total) || totalMaximum <= 0) return ''
  return getGradeDescription(computePercent(total, totalMaximum), scale)
}

export type TotalGradingScale = { referenceMaximum: number; rules: GradeRule[] }

/**
 * Maps a raw TOTAL into the configured totals grading scale. The scale's
 * bands are expressed on a template-level reference maximum (e.g. total out
 * of 700); the assessment's actual maximum (learning areas x 100) is scaled
 * into that same reference frame so a single template works for any number
 * of learning areas:
 *   scaledTotal = total * referenceMaximum / scopeMax
 *
 * When the school has not configured a totals scale (or the scale is empty),
 * the previous behaviour is preserved: the total is normalised to a
 * percentage and graded with the learning-area scale.
 */
export function getTotalLevel(
  total: number | null,
  totalMaximum: number,
  totalScale: TotalGradingScale | null,
  scale: readonly GradeRule[] = GRADING_SCALE,
): string {
  if (total === null || !isAssessed(total) || totalMaximum <= 0) return ''
  if (!totalScale || totalScale.referenceMaximum <= 0 || totalScale.rules.length === 0) {
    return getOverallLevel(total, totalMaximum, scale)
  }
  return getGrade((total * totalScale.referenceMaximum) / totalMaximum, totalScale.rules)
}

export function getTotalDescription(
  total: number | null,
  totalMaximum: number,
  totalScale: TotalGradingScale | null,
  scale: readonly GradeRule[] = GRADING_SCALE,
): string {
  if (total === null || !isAssessed(total) || totalMaximum <= 0) return ''
  if (!totalScale || totalScale.referenceMaximum <= 0 || totalScale.rules.length === 0) {
    return getOverallDescription(total, totalMaximum, scale)
  }
  return getGradeDescription((total * totalScale.referenceMaximum) / totalMaximum, totalScale.rules)
}

/**
 * Standard competition ranking over a list of items keyed by a numeric score.
 * Ties share a position and the next position skips the tied count:
 * totals [480, 460, 460, 460, 430] -> positions [1, 2, 2, 2, 5].
 * Returns a Map keyed by the item id -> position. Null/undefined ids are allowed
 * but their position is not recorded.
 */
export function rankCompetitive<T>(
  scores: { id: string; score: number }[],
  direction: 'desc' | 'asc' = 'desc',
): Map<string, number> {
  const positions = new Map<string, number>()
  const sorted = [...scores].sort((a, b) => (direction === 'desc' ? b.score - a.score : a.score - b.score))
  let previousScore: number | null = null
  let previousPosition = 0
  sorted.forEach((item, index) => {
    if (previousScore !== null && item.score === previousScore) {
      positions.set(item.id, previousPosition)
    } else {
      const position = index + 1
      positions.set(item.id, position)
      previousPosition = position
    }
    previousScore = item.score
  })
  return positions
}

// ─────────────────────────────────────────────────────────────
// Mode-aware configuration resolution
// ─────────────────────────────────────────────────────────────

/**
 * Sensible default TOTAL AGGREGATE grading tiers, expressed as RAW marks
 * against a reference maximum (default 700 — a typical 7 × 100 aggregate).
 *
 * The Total Aggregate system is deliberately SEPARATE from the Learning Area
 * system: totals use a larger numerical range (raw marks, e.g. 0–700) whereas
 * learning areas use 0–100 per subject, so they cannot share the same tier
 * values. These defaults cover the full 0..referenceMaximum range with the
 * same KNEC 4-level percentage boundaries as the learning-area default:
 *   EE ≥ 75%, ME ≥ 41%, AE ≥ 21%, BE < 21%
 * expressed in raw marks, and are stored / edited independently.
 */
export function defaultTotalGradingScale(referenceMaximum = 700): TotalGradingScale {
  const ref = Math.max(1, referenceMaximum)
  const floor = (pct: number) => Number((ref * pct).toFixed(2))
  return {
    referenceMaximum: ref,
    rules: [
      { grade: 'EE', min: floor(0.75), max: ref, description: 'Exceeding Expectations', sort_order: 0 },
      { grade: 'ME', min: floor(0.41), max: floor(0.75) - 0.01, description: 'Meeting Expectations', sort_order: 1 },
      { grade: 'AE', min: floor(0.21), max: floor(0.41) - 0.01, description: 'Approaching Expectations', sort_order: 2 },
      { grade: 'BE', min: 0, max: floor(0.21) - 0.01, description: 'Below Expectations', sort_order: 3 },
    ],
  }
}

/**
 * In-memory KNEC default level sets (4- and 8-level), mirroring the SQL
 * `knec_default_levels` function. Used to seed the grading settings UI and as
 * a runtime fallback when no configuration row exists yet.
 */
export function knecDefaultLevels(mode: GradingMode): GradeRule[] {
  if (mode === '8') {
    return [
      { grade: 'EE1', min: 90, max: 100, name: 'Exceeding Expectations 1', description: 'Exceeding Expectations 1', points: 8, broad: 'EE', sort_order: 0, color: '#15803d' },
      { grade: 'EE2', min: 75, max: 89, name: 'Exceeding Expectations 2', description: 'Exceeding Expectations 2', points: 7, broad: 'EE', sort_order: 1, color: '#22c55e' },
      { grade: 'ME1', min: 58, max: 74, name: 'Meeting Expectations 1', description: 'Meeting Expectations 1', points: 6, broad: 'ME', sort_order: 2, color: '#2563eb' },
      { grade: 'ME2', min: 41, max: 57, name: 'Meeting Expectations 2', description: 'Meeting Expectations 2', points: 5, broad: 'ME', sort_order: 3, color: '#60a5fa' },
      { grade: 'AE1', min: 31, max: 40, name: 'Approaching Expectations 1', description: 'Approaching Expectations 1', points: 4, broad: 'AE', sort_order: 4, color: '#d97706' },
      { grade: 'AE2', min: 21, max: 30, name: 'Approaching Expectations 2', description: 'Approaching Expectations 2', points: 3, broad: 'AE', sort_order: 5, color: '#f59e0b' },
      { grade: 'BE1', min: 11, max: 20, name: 'Below Expectations 1', description: 'Below Expectations 1', points: 2, broad: 'BE', sort_order: 6, color: '#dc2626' },
      { grade: 'BE2', min: 0, max: 10, name: 'Below Expectations 2', description: 'Below Expectations 2', points: 1, broad: 'BE', sort_order: 7, color: '#f87171' },
    ]
  }
  return [
    { grade: 'EE', min: 75, max: 100, name: 'Exceeding Expectations', description: 'Exceeding Expectations', points: null, broad: 'EE', sort_order: 0, color: '#15803d' },
    { grade: 'ME', min: 41, max: 74, name: 'Meeting Expectations', description: 'Meeting Expectations', points: null, broad: 'ME', sort_order: 1, color: '#2563eb' },
    { grade: 'AE', min: 21, max: 40, name: 'Approaching Expectations', description: 'Approaching Expectations', points: null, broad: 'AE', sort_order: 2, color: '#d97706' },
    { grade: 'BE', min: 0, max: 20, name: 'Below Expectations', description: 'Below Expectations', points: null, broad: 'BE', sort_order: 3, color: '#dc2626' },
  ]
}

/**
 * Returns the active mode ('4'|'8') for the tenant. Defaults to '4' to give a
 * deterministic, documented start for schools that have not explicitly chosen.
 */
export async function getTenantGradingMode(tenantId: string): Promise<GradingMode> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('grading_configurations')
    .select('mode')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .maybeSingle()
  if (error || !data) return '4'
  return (data.mode === '8' ? '8' : '4')
}

/**
 * Loads the active grading configuration (mode + levels) for the tenant.
 * Falls back to the previous `report_grading_levels` model, then to the
 * in-memory KNEC defaults, so existing schools keep working unchanged and
 * become 4-level by default until they explicitly configure.
 */
export async function getActiveGradingConfiguration(tenantId: string): Promise<GradingConfig> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('grading_configurations')
    .select('id, mode, grading_configuration_levels(code, min_percent, max_percent, points, name, description, broad, sort_order, color)')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .maybeSingle()
  if (!error && data && Array.isArray(data.grading_configuration_levels) && data.grading_configuration_levels.length) {
    const mode: GradingMode = data.mode === '8' ? '8' : '4'
    const levels: GradeRule[] = (data.grading_configuration_levels as any[])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(l => ({
        grade: l.code,
        min: Number(l.min_percent),
        max: Number(l.max_percent),
        description: l.description || l.name || l.code,
        name: l.name || l.code,
        points: l.points != null ? Number(l.points) : null,
        broad: l.broad ?? null,
        sort_order: l.sort_order ?? 0,
        color: l.color || '#64748b',
      }))
    return { mode, levels }
  }
  // Fallback: the classic per-learning-area scale (report_grading_levels).
  const { data: template } = await supabase.from('report_templates').select('id').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  if (template?.id) {
    const { data, error: lerr } = await supabase
      .from('report_grading_levels')
      .select('level_code,min_score,max_score,description,sort_order')
      .eq('tenant_id', tenantId)
      .eq('report_template_id', template.id)
      .order('sort_order')
    if (!lerr && data?.length) {
      return {
        mode: '4',
        levels: data.map(r => ({
          grade: r.level_code, min: Number(r.min_score), max: Number(r.max_score),
          description: r.description, sort_order: r.sort_order,
        })),
      }
    }
  }
  return { mode: '4', levels: knecDefaultLevels('4') }
}

/**
 * Backward-compatible resolver: returns the active config's levels as
 * `GradeRule[]`. Callers that only need per-subject / overall grade matching
 * (results, analysis, reports, PDFs, broadsheet) keep working unchanged and
 * now automatically respect the school's grading mode.
 */
export async function getTenantGradingScale(tenantId: string): Promise<GradeRule[]> {
  const config = await getActiveGradingConfiguration(tenantId)
  return config.levels
}

/**
 * Picks the ACTUAL configured remark text (from the tenant's remark bank) that
 * corresponds to a learner's achievement level — not a hard-coded label or the
 * level description (spec §26).
 *
 * The remark bank (`report_teacher_remarks` / `report_principal_remarks`) is
 * stored best→worst (ascending sort_order), matching the grading scale which is
 * ordered best→worst too. The learner's overall level is looked up in `scale`
 * and the remark at the same position is returned. Returns '' (neutral empty
 * state) when there is no level or no bank entries — callers render a neutral
 * placeholder rather than fabricating an achievement phrase.
 */
export function remarkForLevel(overallLevel: string | null | undefined, scale: readonly GradeRule[] | undefined, bank: readonly string[] | undefined): string {
  if (!overallLevel || !bank?.length) return ''
  const idx = (scale ?? []).findIndex(r => r.grade === overallLevel)
  if (idx < 0) return ''
  return bank[Math.min(idx, bank.length - 1)]?.trim() ?? ''
}

/**
 * The configured overall/totals grading scale.
 *
 * When the school has not yet configured a totals scale, sensible raw-mark
 * defaults are returned automatically (see `defaultTotalGradingScale`) so the
 * Total Aggregate system always has its own distinct tiers — it never silently
 * reuses the Learning Area percentage scale. The returned scale is fully
 * editable via the grading settings page.
 */
export async function getTenantTotalGradingScale(tenantId: string): Promise<TotalGradingScale | null> {
  const supabase = await createClient()
  const { data: template } = await supabase.from('report_templates').select('id').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  if (!template?.id) return defaultTotalGradingScale()
  const { data, error } = await supabase
    .from('report_total_grading_levels')
    .select('level_code,min_score,max_score,description,sort_order,reference_maximum')
    .eq('tenant_id', tenantId)
    .eq('report_template_id', template.id)
    .order('sort_order')
  if (error || !data?.length) return defaultTotalGradingScale(Number(data?.[0]?.reference_maximum) || 700)
  return {
    referenceMaximum: Number(data[0].reference_maximum),
    rules: data.map(r => ({
      grade: r.level_code, min: Number(r.min_score), max: Number(r.max_score),
      description: r.description, sort_order: r.sort_order,
    })),
  }
}
