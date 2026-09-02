#!/usr/bin/env node
/**
 * E-REPORTS load-test account provisioning.
 *
 * Creates the real authenticated users (and supporting rows) needed to run
 * scripts/concurrency-check.mjs against the LIVE database. Idempotent — safe
 * to re-run; existing users are skipped, existing rows left untouched.
 *
 * Usage:
 *   node scripts/create-loadtest-accounts.mjs \
 *     --tenant <tenant_uuid> \
 *     [--count 10] [--user-base loadtest] [--domain school.test] \
 *     [--password 'LoadTest#2026!'] [--foreign-tenant-name 'CONCURRENCY CROSS-TENANT'] \
 *     [--foreign-tenant-code CROSSTEST]
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
 * (the service role is the machine-level equivalent of signing in as the
 * super admin — it bypasses RLS, so it can provision users and profiles).
 *
 * Accounts created:
 *   - <user-base>01@<domain> .. <user-base><count>@<domain>  (role=admin, tenant=--tenant)
 *   - if --foreign-tenant-name is given: one extra tenant and a single
 *     foreign admin (<user-base>-foreign@<domain>) so the cross-tenant
 *     isolation test (concurrency-check TEST E) can run.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const args = parseArgs({
  options: {
    url: { type: 'string' },
    key: { type: 'string' },
    tenant: { type: 'string' },
    count: { type: 'string', default: '10' },
    'user-base': { type: 'string', default: 'loadtest' },
    domain: { type: 'string', default: 'school.test' },
    password: { type: 'string' },
    'foreign-tenant-name': { type: 'string' },
    'foreign-tenant-code': { type: 'string' },
  },
})
const a = args.values

function fromEnvLocal(names) {
  try {
    const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (m && names.includes(m[1])) return m[2].replace(/^"(.*)"$/, '$1')
    }
  } catch {
    /* no .env.local */
  }
  return undefined
}

const SUPABASE_URL = a.url ?? fromEnvLocal(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'])
const SUPABASE_KEY = a.key ?? fromEnvLocal(['SUPABASE_SERVICE_ROLE_KEY'])
const COUNT = Number(a.count)
const PASSWORD = a.password ?? 'LoadTest#2026!'

if (!SUPABASE_URL || !SUPABASE_KEY || !a.tenant || !Number.isInteger(COUNT) || COUNT < 1) {
  console.error('Missing / invalid arguments. See the header comment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const pad = (n) => String(n).padStart(2, '0')
const emails = Array.from({ length: COUNT }, (_, i) => `${a['user-base']}${pad(i + 1)}@${a.domain}`)
let foreignEmail = null

async function ensureUser(supabaseAdmin, email) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error && /already registered|already been registered/i.test(error.message)) {
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const hit = existing?.users?.find((u) => u.email === email)
    if (hit) return hit
    throw error
  }
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  return data.user
}

async function ensureProfile(supabaseAdmin, userId, tenantId, fullName) {
  const { data: existing } = await supabaseAdmin.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (existing) return false
  const { error } = await supabaseAdmin.from('profiles').insert({ id: userId, tenant_id: tenantId, full_name: fullName, role: 'admin' })
  if (error) throw new Error(`profile insert for ${fullName}: ${error.message}`)
  return true
}

async function main() {
  const created = []
  for (const email of emails) {
    const user = await ensureUser(supabase, email)
    const isNew = await ensureProfile(supabase, user.id, a.tenant, `${a['user-base']} account ${email.replace(/@.*$/, '').replace(/^\D+/, '')}`)
    created.push({ email, status: isNew ? 'created' : 'exists' })
  }

  let foreignTenantId = null
  if (a['foreign-tenant-name']) {
    const code = a['foreign-tenant-code'] ?? 'CROSS-TEST'
    const { data: dup } = await supabase.from('tenants').select('id').eq('code', code).maybeSingle()
    if (dup) {
      foreignTenantId = dup.id
    } else {
      const { data: ins, error: tErr } = await supabase.from('tenants').insert({ name: a['foreign-tenant-name'], code }).select('id').single()
      if (tErr) throw new Error(`tenant insert: ${tErr.message}`)
      foreignTenantId = ins.id
    }
    foreignEmail = `${a['user-base']}-foreign@${a.domain}`
    const user = await ensureUser(supabase, foreignEmail)
    await ensureProfile(supabase, user.id, foreignTenantId, `${a['user-base']} foreign account`)
    created.push({ email: foreignEmail, tenant: 'foreign', status: 'ready' })
  }

  for (const r of created) console.log(`${r.status.padEnd(7)}  ${r.email}${r.tenant ? `  (tenant ${r.tenant})` : ''}`)
  console.log(`\n${COUNT} load-test admin(s) attached to tenant ${a.tenant}.`)
  if (foreignTenantId) console.log(`Foreign tenant ${foreignTenantId} ready for TEST E.`)
  const usersList = emails.map((e) => `${e}:${PASSWORD}`).join(',')
  console.log(`\nconcurrency-check users string:\n  ${usersList}`)
}

main().catch((err) => {
  console.error('Fatal:', err?.message ?? err)
  process.exit(1)
})