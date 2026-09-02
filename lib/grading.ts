import { createClient } from '@/lib/supabase/server'

export const GRADING_SCALE = [
  { grade: 'EE', min: 80, max: 100, description: 'Exceeding Expectation' },
  { grade: 'ME', min: 60, max: 79.99, description: 'Meeting Expectation' },
  { grade: 'AE', min: 40, max: 59.99, description: 'Approaching Expectation' },
  { grade: 'BE', min: 0, max: 39.99, description: 'Below Expectation' },
] as const

export type GradeRule = { grade: string; min: number; max: number; description: string; sort_order?: number }

export function getGrade(score: number, scale: readonly GradeRule[] = GRADING_SCALE) {
  const rule = getGradeRule(score, scale)
  return rule?.grade ?? ''
}

export function getGradeDescription(score: number, scale: readonly GradeRule[] = GRADING_SCALE) {
  const rule = getGradeRule(score, scale)
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

export async function getTenantGradingScale(tenantId: string): Promise<GradeRule[]> {
  const supabase = await createClient()
  const { data: template } = await supabase.from('report_templates').select('id').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  if (!template?.id) return [...GRADING_SCALE]
  const { data, error } = await supabase.from('report_grading_levels').select('level_code,min_score,max_score,description,sort_order').eq('tenant_id', tenantId).eq('report_template_id', template.id).order('sort_order')
  if (error || !data?.length) return [...GRADING_SCALE]
  return data.map(r => ({ grade: r.level_code, min: Number(r.min_score), max: Number(r.max_score), description: r.description, sort_order: r.sort_order }))
}

/** The configured overall/totals grading scale, or null when not configured. */
export async function getTenantTotalGradingScale(tenantId: string): Promise<TotalGradingScale | null> {
  const supabase = await createClient()
  const { data: template } = await supabase.from('report_templates').select('id').eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
  if (!template?.id) return null
  const { data, error } = await supabase
    .from('report_total_grading_levels')
    .select('level_code,min_score,max_score,description,sort_order,reference_maximum')
    .eq('tenant_id', tenantId)
    .eq('report_template_id', template.id)
    .order('sort_order')
  if (error || !data?.length) return null
  return {
    referenceMaximum: Number(data[0].reference_maximum),
    rules: data.map(r => ({ grade: r.level_code, min: Number(r.min_score), max: Number(r.max_score), description: r.description, sort_order: r.sort_order })),
  }
}
