/**
 * Centralized mapping of database constraint errors to user-facing messages.
 *
 * PostgreSQL error code 23505 = unique_violation. The constraint name identifies
 * which business rule was breached. We map each known constraint to a friendly
 * message and log the raw error server-side for debugging.
 *
 * SECURITY: Raw Postgres error details, constraint names, and SQL internals
 * must NEVER be returned to the browser.
 */

interface DbError {
  code?: string
  message?: string
  constraint?: string
  details?: string
  hint?: string
}

/** Constraint-name → user message. Matches the auto-generated names PostgreSQL
 *  assigns to `UNIQUE (tenant_id, ...)` constraints in the migrations. */
const CONSTRAINT_MAP: Record<string, string> = {
  subjects_tenant_id_name_key:    'A learning area with this name is already registered in this school. Please use a different name.',
  classes_tenant_id_name_key:     'A grade with this name is already registered in this school. Please use a different name.',
  students_tenant_id_admission_no_key: 'A learner with this admission number is already registered in this school.',
  streams_class_id_name_key:      'A stream with this name already exists in this grade.',
  tenants_code_key:               'A school with this code already exists.',
}

/** Title lines that accompany the user-facing detail message. */
const CONSTRAINT_TITLE: Record<string, string> = {
  subjects_tenant_id_name_key:    'Learning area already exists',
  classes_tenant_id_name_key:     'Grade already exists',
  students_tenant_id_admission_no_key: 'Learner already exists',
  streams_class_id_name_key:      'Stream already exists',
  tenants_code_key:               'School code already exists',
}

/** Map a Supabase/Postgres error to a safe user-facing message.
 *  Returns null when the error is unexpected (caller should show a generic
 *  message). The raw error is logged to the server console. */
export function mapDbError(error: DbError | null | undefined): { title: string; message: string } | null {
  if (!error) return null

  // Log full details server-side for debugging (never sent to browser).
  console.error('[db-error]', JSON.stringify({ code: error.code, constraint: error.constraint, message: error.message }))

  // 23505 = unique_violation
  if (error.code === '23505') {
    // Try constraint name first (most specific)
    const byConstraint = error.constraint ? CONSTRAINT_MAP[error.constraint] : undefined
    if (byConstraint) {
      return { title: CONSTRAINT_TITLE[error.constraint!] ?? 'Already exists', message: byConstraint }
    }
    // Fallback: match the constraint name from the human-readable message
    // because some Supabase versions embed it in error.message.
    for (const [name, msg] of Object.entries(CONSTRAINT_MAP)) {
      if (error.message?.includes(name)) {
        return { title: CONSTRAINT_TITLE[name] ?? 'Already exists', message: msg }
      }
    }
    // Generic unique-violation fallback (no details exposed)
    return { title: 'Already exists', message: 'A record with this information already exists. Please check your input and try again.' }
  }

  // Foreign key violation
  if (error.code === '23503') {
    return { title: 'Invalid reference', message: 'The selected item is no longer available. Please refresh and try again.' }
  }

  // Not-null violation
  if (error.code === '23502') {
    return { title: 'Missing information', message: 'A required field is missing. Please check all required fields.' }
  }

  // All other errors: do NOT expose details
  return null
}

/** Convenience: returns a safe redirect searchParams string for an error.
 *  Usage: redirect(`/path?error=${encodeURIComponent(mapDbErrorRedirect(err))}`)
 *  Returns a generic safe fallback when the error cannot be mapped. */
export function friendlyDbMessage(error: DbError | null | undefined): string {
  const mapped = mapDbError(error)
  return mapped ? mapped.message : 'An unexpected error occurred. Please try again.'
}

/** Convenience: returns just the title line (e.g. "Learning area already exists").
 *  Falls back to "Error" for unmapped errors. */
export function friendlyDbTitle(error: DbError | null | undefined): string {
  const mapped = mapDbError(error)
  return mapped ? mapped.title : 'Error'
}

/** Returns "title|message" for use in URL query params.
 *  The consuming page splits on "|" and renders title bold, message as detail.
 *  Falls back to a generic safe message for unmapped errors. */
export function friendlyDbRedirect(error: DbError | null | undefined): string {
  const mapped = mapDbError(error)
  if (mapped) return `${mapped.title}|${mapped.message}`
  return 'Error|An unexpected error occurred. Please try again.'
}
