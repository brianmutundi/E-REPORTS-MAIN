import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Term helpers used to interpret an examination's term label.
 *
 * Assessment Report opening/closing dates are intentionally independent of
 * the school's `terms` calendar. They live in `report_template_configs` and
 * are used only by the Assessment Reports workflow.
 */

export const NEXT_TERM_OPENING_PLACEHOLDER = 'To be announced'

export type TermReference = {
  year: number
  label: string
  termNumber: number
}

export type EffectiveTermDates = {
  closingDate: string | null
  openingDate: string | null
  currentLabel: string | null
  nextLabel: string | null
  currentTerm: TermReference | null
}

const TERM_NUMBER_WORDS: Record<string, number> = {
  one: 1, first: 1, 1: 1,
  two: 2, second: 2, 2: 2,
  three: 3, third: 3, 3: 3,
  four: 4, fourth: 4, 4: 4,
}

const ROMAN_TO_NUMBER: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 }

function termNumberFromText(text: string): number | null {
  const normalized = text
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .trim()
  if (!normalized) return null
  const digit = normalized.match(/\b([1-4])\b/)
  if (digit) return parseInt(digit[1], 10)
  const word = normalized.match(/\b(one|two|three|four|first|second|third|fourth)\b/)
  if (word) return TERM_NUMBER_WORDS[word[1]] ?? null
  const roman = normalized.match(/\b([iv]{1,4})\b/)
  if (roman) return ROMAN_TO_NUMBER[roman[1]] ?? null
  return null
}

export function parseTermReference(opts: { term?: string | null; academicYear?: number | null }): TermReference | null {
  const year = opts.academicYear ?? null
  const termNumber = termNumberFromText(opts.term ?? '')
  if (year == null || termNumber == null) return null
  return { year, termNumber, label: termLabel(termNumber) }
}

export function termLabel(termNumber: number): string {
  return `Term ${termNumber}`
}

export function nextTermReference(current: TermReference): TermReference {
  if (current.termNumber < 3) {
    const termNumber = current.termNumber + 1
    return { year: current.year, termNumber, label: termLabel(termNumber) }
  }
  return { year: current.year + 1, termNumber: 1, label: termLabel(1) }
}

export function previousTermReference(current: TermReference): TermReference {
  if (current.termNumber > 1) {
    const termNumber = current.termNumber - 1
    return { year: current.year, termNumber, label: termLabel(termNumber) }
  }
  return { year: current.year - 1, termNumber: 3, label: termLabel(3) }
}

export function compareTermDates(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

/**
 * Reads the independent Assessment Report dates.
 * The ref parameter is retained for compatibility with existing callers;
 * report dates are deliberately not looked up from the `terms` table.
 */
export async function getTermRowDates(
  supabase: SupabaseClient,
  tenantId: string,
  _ref: TermReference,
): Promise<{ opening_date: string | null; closing_date: string | null }> {
  const { data: template } = await supabase
    .from('report_templates')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .maybeSingle()

  if (!template?.id) return { opening_date: null, closing_date: null }

  const { data, error } = await supabase
    .from('report_template_configs')
    .select('opening_date,closing_date')
    .eq('tenant_id', tenantId)
    .eq('report_template_id', template.id)
    .maybeSingle()

  if (error || !data) return { opening_date: null, closing_date: null }
  return { opening_date: data.opening_date ?? null, closing_date: data.closing_date ?? null }
}

/**
 * Returns the independent Assessment Report date pair.
 * No `terms` row is read and no next-term calendar date is inferred.
 */
export async function getEffectiveTermDates(
  supabase: SupabaseClient,
  tenantId: string,
  current: TermReference | null,
): Promise<EffectiveTermDates> {
  const empty: EffectiveTermDates = {
    closingDate: null,
    openingDate: null,
    currentLabel: current?.label ?? null,
    nextLabel: current ? nextTermReference(current).label : null,
    currentTerm: current,
  }

  const { data: template } = await supabase
    .from('report_templates')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .maybeSingle()

  if (!template?.id) return empty

  const { data, error } = await supabase
    .from('report_template_configs')
    .select('opening_date,closing_date')
    .eq('tenant_id', tenantId)
    .eq('report_template_id', template.id)
    .maybeSingle()

  if (error || !data) return empty

  return {
    closingDate: data.closing_date ?? null,
    openingDate: data.opening_date ?? null,
    currentLabel: current?.label ?? null,
    nextLabel: current ? nextTermReference(current).label : null,
    currentTerm: current,
  }
}
