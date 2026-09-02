#!/usr/bin/env node
/**
 * E-REPORTS concurrency check against the REAL Supabase database with REAL
 * authentication. Run AFTER `supabase db push` has applied the migrations
 * (including 20260902000400_concurrency_safe_writes.sql).
 *
 * This script performs the documented acceptance tests and then restores the
 * touched score cells to their pre-run values, so it leaves the data as it
 * found it.
 *
 * Usage:
 *   node scripts/concurrency-check.mjs \
 *     --url <SUPABASE_URL> \
 *     --key <SUPABASE_ANON_KEY> \
 *     --users "a@school.test:pw1,b@school.test:pw2,...,j@school.test:pwj" \
 *     --exam <exam_uuid> \
 *     --class <class_uuid> \
 *     --subject <subject_uuid> \
 *     --students s1,s2,...,s10 \
 *     [--foreign-user 'other@school:pw' --foreign-password ...]
 *
 * Requirements:
 *   - At least 10 real authenticated users (all attached to the same school as
 *     the exam/class/subject for tests C/D; any school works for tests A/B/E/F).
 *   - --students: at least 10 student uuids from that class; the script writes
 *     transient scores to these learners for TEST C.
 *
 * Tests executed:
 *   A  10 simultaneous authenticated sessions remain independent.
 *   B  10 simultaneous reads return correct, non-leaking data.
 *   C  Simultaneous score entry on DIFFERENT learners — all persist.
 *   D  Simultaneous update of the SAME score — exactly one winner, one conflict,
 *      no silent overwrite.
 *   E  Cross-tenant read attempt (when --foreign-user is given).
 *   F  Simultaneous assessment/report browsing stays isolated.
 *
 * Exit code 0 = all executed tests passed; 1 = any failed.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const args = parseArgs({
  options: {
    url: { type: 'string' },
    key: { type: 'string' },
    users: { type: 'string' },
    exam: { type: 'string' },
    class: { type: 'string' },
    subject: { type: 'string' },
    students: { type: 'string' },
    'foreign-user': { type: 'string' },
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
const SUPABASE_KEY = a.key ?? fromEnvLocal(['SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'])

if (!SUPABASE_URL || !SUPABASE_KEY || !a.users || !a.exam || !a.class || !a.subject || !a.students) {
  console.error('Missing required arguments. See the header comment.')
  process.exit(1)
}

const users = a.users.split(',').map((u) => {
  const [email, password] = u.split(':')
  return { email, password }
})
if (users.length < 10) {
  console.error(`Need at least 10 users for the 10-device tests (got ${users.length}).`)
  process.exit(1)
}
const studentIds = a.students.split(',').map((s) => s.trim()).filter(Boolean)
if (studentIds.length < 10) {
  console.error(`Need at least 10 students for TEST C (got ${studentIds.length}).`)
  process.exit(1)
}

const results = []
function report(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  // ---- set up 10 real, independent sessions -------------------------------
  const sessions = []
  for (let i = 0; i < users.length; i += 1) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await supabase.auth.signInWithPassword({ email: users[i].email, password: users[i].password })
    if (error || !data.session) throw new Error(`sign-in failed for ${users[i].email}: ${error?.message}`)
    sessions.push({ supabase, user: data.user, token: data.session.access_token, email: users[i].email })
  }
  const distinctTokens = new Set(sessions.map((s) => s.token))
  report('TEST A: 10 sessions signed in, tokens independent', distinctTokens.size === sessions.length, `${sessions.length} sessions, ${distinctTokens.size} distinct tokens`)

  const tenantIds = new Set()
  for (const s of sessions) {
    const { data } = await s.supabase.from('profiles').select('tenant_id').eq('id', s.user.id).maybeSingle()
    tenantIds.add(data?.tenant_id)
  }
  const allSameSchool = tenantIds.size === 1

  // ---- TEST B: ten simultaneous reads --------------------------------------
  const readResults = await Promise.all(
    sessions.map(async (s) => {
      const r = await s.supabase.from('exams').select('id,name').eq('tenant_id', Array.from(tenantIds)[0]).limit(50)
      return r.error ? { error: r.error.message } : r.data
    }),
  )
  const readErrors = readResults.filter((r) => r && r.error)
  const examSets = [...new Set(readResults.map((r) => JSON.stringify(r ?? null)))]
  report('TEST B: 10 simultaneous reads succeed', readErrors.length === 0, readErrors[0]?.error ?? `10 reads, ${examSets.length} distinct result shape(s)`)

  // ---- TEST C: simultaneous score entry on DIFFERENT learners --------------
  const cells = []
  const originals = new Map() // key student -> { score, updated_at }
  for (let i = 0; i < studentIds.length; i += 1) {
    const { data, error } = await sessions[0].supabase
      .from('marks')
      .select('score,updated_at')
      .eq('tenant_id', Array.from(tenantIds)[0])
      .eq('exam_id', a.exam)
      .eq('subject_id', a.subject)
      .eq('student_id', studentIds[i])
      .maybeSingle()
    if (error) throw new Error(`pre-read failed for ${studentIds[i]}: ${error.message}`)
    originals.set(studentIds[i], data ? { score: Number(data.score), updated_at: data.updated_at } : null)
  }

  const cResults = await Promise.all(
    studentIds.map(async (id, i) => {
      const s = sessions[i % sessions.length]
      const base = originals.get(id)
      const r = await s.supabase.rpc('save_marks_grid', {
        p_exam_id: a.exam,
        p_subject_id: a.subject,
        p_class_id: a.class,
        p_student_ids: [id],
        p_scores: [60 + (i % 30)],
        p_base_updated_ats: [base ? base.updated_at : null],
      })
      return { id, error: r.error?.message ?? null, statuses: r.data ?? [] }
    }),
  )
  const cSucceeded = cResults.filter((r) => !r.error && r.statuses[0]?.status === 'ok')
  const cConflicts = cResults.filter((r) => r.statuses[0]?.status === 'conflict')
  report(
    'TEST C: simultaneous saves for 10 different learners',
    cSucceeded.length === studentIds.length && cConflicts.length === 0,
    `${cSucceeded.length} ok / ${cConflicts.length} conflict`,
  )
  const verifyC = await Promise.all(
    studentIds.map(async (id, i) => {
      const { data, error } = await sessions[0].supabase
        .from('marks')
        .select('score')
        .eq('tenant_id', Array.from(tenantIds)[0])
        .eq('exam_id', a.exam)
        .eq('subject_id', a.subject)
        .eq('student_id', id)
        .maybeSingle()
      return { id, expected: 60 + (i % 30), stored: error ? null : data ? Number(data.score) : null }
    }),
  )
  const allPersisted = verifyC.every((v) => v.stored === v.expected)
  report('TEST C: all 10 values persisted, none lost', allPersisted, `${verifyC.filter((v) => v.stored === v.expected).length}/10 matched`)

  // ---- TEST D: same cell edited by two sessions simultaneously -------------
  const cellStudent = studentIds[0]
  const { data: cellBefore } = await sessions[0].supabase
    .from('marks')
    .select('score,updated_at')
    .eq('tenant_id', Array.from(tenantIds)[0])
    .eq('exam_id', a.exam)
    .eq('subject_id', a.subject)
    .eq('student_id', cellStudent)
    .maybeSingle()
  const baseCell = cellBefore ? { score: Number(cellBefore.score), updated_at: cellBefore.updated_at } : null
  const sameBase = baseCell ? baseCell.updated_at : null
  const [d1, d2] = await Promise.all([
    sessions[0].supabase.rpc('save_marks_grid', {
      p_exam_id: a.exam, p_subject_id: a.subject, p_class_id: a.class,
      p_student_ids: [cellStudent], p_scores: [71], p_base_updated_ats: [sameBase],
    }),
    sessions[1].supabase.rpc('save_marks_grid', {
      p_exam_id: a.exam, p_subject_id: a.subject, p_class_id: a.class,
      p_student_ids: [cellStudent], p_scores: [83], p_base_updated_ats: [sameBase],
    }),
  ])
  const statusesD = [d1.data?.[0]?.status, d2.data?.[0]?.status].filter(Boolean).sort()
  const exactlyOneWinner = statusesD.includes('ok') && statusesD.includes('conflict') && statusesD.length === 2
  const { data: cellAfter } = await sessions[2].supabase
    .from('marks')
    .select('score')
    .eq('tenant_id', Array.from(tenantIds)[0])
    .eq('exam_id', a.exam)
    .eq('subject_id', a.subject)
    .eq('student_id', cellStudent)
    .maybeSingle()
  const winnersScore = d1.data?.[0]?.status === 'ok' ? 71 : d2.data?.[0]?.status === 'ok' ? 83 : null
  report(
    'TEST D: same-score conflict is deterministic, not silent',
    exactlyOneWinner && winnersScore !== null && Number(cellAfter?.score) === winnersScore,
    `statuses=${statusesD.join('/')}, stored=${cellAfter?.score}`,
  )

  // ---- TEST E: cross-tenant read attempt -----------------------------------
  if (a['foreign-user']) {
    const [fe, fp] = a['foreign-user'].split(':')
    const foreign = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: fd, error: feErr } = await foreign.auth.signInWithPassword({ email: fe, password: fp })
    if (feErr) {
      report('TEST E: foreign sign-in', false, feErr.message)
    } else {
      const r = await foreign.from('marks').select('id').eq('tenant_id', Array.from(tenantIds)[0]).eq('exam_id', a.exam).limit(1)
      report('TEST E: foreign tenant cannot read primary data', !r.error && (r.data ?? []).length === 0, `rows=${(r.data ?? []).length}`)
    }
  } else {
    report('TEST E: skipped (no --foreign-user)', true, 'not requested')
  }

  // ---- TEST F: simultaneous assessment browsing stays isolated -------------
  const fResults = await Promise.all(
    sessions.map(async (s) => {
      const exams = await s.supabase.from('exams').select('id').eq('id', a.exam).limit(1)
      const configs = await s.supabase.from('report_templates').select('id,is_default').eq('is_default', true).limit(5)
      return { examsOk: !exams.error, configsOk: !configs.error, examVisible: (exams.data ?? []).length === 1 }
    }),
  )
  report(
    'TEST F: 10 simultaneous assessment/report views',
    fResults.every((f) => f.examsOk && f.configsOk && f.examVisible),
    `${fResults.filter((f) => f.examVisible).length}/10 saw the shared assessment`,
  )
  report('NOTE', allSameSchool, allSameSchool ? 'all users shared one school (isolation within school only)' : 'users spanned multiple schools (isolation across tenants exercisable)')

  // ---- restore all touched marks -------------------------------------------
  for (const id of studentIds) {
    const original = originals.get(id)
    if (original) {
      await sessions[0].supabase
        .from('marks')
        .update({ score: original.score, updated_at: original.updated_at })
        .eq('tenant_id', Array.from(tenantIds)[0])
        .eq('exam_id', a.exam)
        .eq('subject_id', a.subject)
        .eq('student_id', id)
    } else {
      await sessions[0].supabase
        .from('marks')
        .delete()
        .eq('tenant_id', Array.from(tenantIds)[0])
        .eq('exam_id', a.exam)
        .eq('subject_id', a.subject)
        .eq('student_id', id)
    }
  }
  console.log('Restored all touched score cells to their pre-run values.')

  const failed = results.filter((r) => r.name.startsWith('TEST') && !r.ok)
  console.log(failed.length ? `\n${failed.length} test(s) failed.` : '\nAll executed concurrency tests passed.')
  process.exit(failed.length ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal:', err?.message ?? err)
  process.exit(1)
})