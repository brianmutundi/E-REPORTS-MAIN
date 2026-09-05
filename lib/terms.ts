import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Term calendar helpers.
 *
 * Schools report "School closes on {closing} and opens on {opening}". The
 * closing date belongs to the CURRENT term (the one the examination is in);
 * the opening date shown on the report is the START of the NEXT term, so it
 * must always fall after the closing date. Term dates are stored per tenant
 * in the `terms` table (keyed by academic year + term label); a missing next
 * term opening renders the "To be announced" placeholder instead of a wrong
 * or earlier date.
 */

export const NEXT_TERM_OPENING_PLACEHOLDER = 'To be announced'

export type TermReference = {
  /** e.g. 2026 */
  year: number
  /** e.g. "Term 2" */
  label: string
  /** 1-based term number within its academic year */
  termNumber: number
}

export type EffectiveTermDates = {
  /** Closing date of the current term (ISO date string or null). */
  closingDate: string | null
  /** Opening date of the NEXT term (ISO date string, null when unknown/bad). */
  openingDate: string | null
  currentLabel: string | null
  nextLabel: string | null
  currentTerm: TermReference | null
}

const TERM_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  first: 1,
  1: 1,
  two: 2,
  second: 2,
  2: 2,
  three: 3,
  third: 3,
  3: 3,
  four: 4,
  fourth: 4,
  4: 4,
}

const ROMAN_TO_NUMBER: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 }

function termNumberFromText(text: string): number | null {
  const normalized = text
    .toLowerCase()
    // strip a leading 4-digit academic year so "2026 Term 1" parses as 1
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .trim()
  if (!normalized) return null
  const digit = normalized.match(/\b([1-4])\b/)
  if (digit) return parseInt(digit[1], 10)
  const word = normalized.match(/\b(one|two|three|four|first|second|third|fourth)\b/)
  if (word) return TERM_NUMBER_WORDS[word[1]] ?? null
  const roman = normalized.match(/\b([iv]{1,3}|iv)\b/)
  if (roman) return ROMAN_TO_NUMBER[roman[1]] ?? null
  return null
}

/** Parses an exam's free-text term ("TERM 2", "Term 1", "T3") + academic year into a TermReference. */
export function parseTermReference(opts: { term?: string | null; academicYear?: number | null }): TermReference | null {
  const year = opts.academicYear ?? null
  const termNumber = termNumberFromText(opts.term ?? '')
  if (year == null || termNumber == null) return null
  return { year, termNumber, label: termLabel(termNumber) }
}

export function termLabel(termNumber: number): string {
  return `Term ${termNumber}`
}

/** The term that follows `current` — Term 3 rolls into Term 1 of the next academic year. */
export function nextTermReference(current: TermReference): TermReference {
  if (current.termNumber < 3) {
    const termNumber = current.termNumber + 1
    return { year: current.year, termNumber, label: termLabel(termNumber) }
  }
  return { year: current.year + 1, termNumber: 1, label: termLabel(1) }
}

/** The term that precedes `current` — Term 1 rolls back into Term 3 of the previous academic year. */
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

/** Reads a term row's own opening/closing dates (used to pre-fill the settings form). */
export async function getTermRowDates(
  supabase: SupabaseClient,
  tenantId: string,
  ref: TermReference,
): Promise<{ opening_date: string | null; closing_date: string | null }> {
  const { data, error } = await supabase
    .from('terms')
    .select('opening_date,closing_date')
    .eq('tenant_id', tenantId)
    .eq('academic_year', ref.year)
    .eq('term_label', ref.label)
    .maybeSingle()
  if (error || !data) return { opening_date: null, closing_date: null }
  return { opening_date: data.opening_date ?? null, closing_date: data.closing_date ?? null }
}

/**
 * Derives the dates a report should show for an examination in `current`:
 *   closing = current term's closing date,
 *   opening = NEXT term's opening date.
 * Safeguards:
 *   - if the next term has no opening date configured, returns null (callers
 *     render the "To be announced" placeholder),
 *   - if a stale/legacy opening date falls on or before the closing date, it
 *     is dropped (report invariants: opening must be after closing).
 */
export async function getEffectiveTermDates(
  supabase: SupabaseClient,
  tenantId: string,
  current: TermReference | null,
): Promise<EffectiveTermDates> {
  if (!current) return { closingDate: null, openingDate: null, currentLabel: null, nextLabel: null, currentTerm: null }

  const next = nextTermReference(current)
  const [curRes, nextRes] = await Promise.all([
    supabase
      .from('terms')
      .select('closing_date')
      .eq('tenant_id', tenantId)
      .eq('academic_year', current.year)
      .eq('term_label', current.label)
      .maybeSingle(),
    supabase
      .from('terms')
      .select('opening_date')
      .eq('tenant_id', tenantId)
      .eq('academic_year', next.year)
      .eq('term_label', next.label)
      .maybeSingle(),
  ])

  const closingDate = curRes.error || !curRes.data ? null : (curRes.data.closing_date ?? null)
  let openingDate = nextRes.error || !nextRes.data ? null : (nextRes.data.opening_date ?? null)

  // Opening (next term) must be strictly after closing (this term).
  if (openingDate != null && closingDate != null && compareTermDates(openingDate, closingDate) <= 0) {
    openingDate = null
  }

  return { closingDate, openingDate, currentLabel: current.label, nextLabel: next.label, currentTerm: current }
}