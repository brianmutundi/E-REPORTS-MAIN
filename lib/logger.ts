type LogLevel = 'info' | 'warn' | 'error'

const SENSITIVE_KEYS = new Set(['password', 'access_token', 'refresh_token', 'authorization', 'cookie', 'service_role_key', 'supabase_service_role_key'])

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : sanitize(entry)
    }
    return out
  }
  return value
}

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const payload = sanitize({ timestamp: new Date().toISOString(), level, event, ...fields })
  const line = JSON.stringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

export function logError(event: string, error: unknown, fields: Record<string, unknown> = {}) {
  const detail = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { error: String(error) }
  logEvent('error', event, { ...fields, ...detail })
}
