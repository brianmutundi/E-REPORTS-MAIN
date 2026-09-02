import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const content = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const out = {}
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=["']?(.*?)["']?\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}
const env = loadEnv()
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const out = {}
// Tenant + ownership counts
for (const [t, cols, order] of [
  ['tenants', 'id,name,code,status', 'name'],
  ['profiles', 'id,full_name,role,tenant_id', 'full_name'],
  ['classes', 'id,name,tenant_id', 'tenant_id'],
  ['subjects', 'id,name,code,tenant_id', 'tenant_id'],
  ['students', 'id,full_name,tenant_id,class_id,stream_id', 'tenant_id'],
  ['exams', 'id,name,tenant_id', 'tenant_id'],
  ['marks', 'id,tenant_id,exam_id,student_id,subject_id,score', 'tenant_id'],
  ['streams', 'id,name,tenant_id,class_id', 'tenant_id'],
]) {
  const { data, error } = await s.from(t).select(cols).limit(200)
  out[t] = { error: error?.message ?? null, count: data?.length ?? 0 }
  if (data?.[0]) out[t].sample = data[0]
}
// Check referential orphans: marks pointing at missing student/exam/subject
const { data: marks } = await s.from('marks').select('tenant_id,exam_id,student_id,subject_id,score')
out.marks_total = marks?.length ?? 0
// Data integrity: any marks with tenant mismatch on student/exam
const { data: students } = await s.from('students').select('id,tenant_id')
const { data: exams } = await s.from('exams').select('id,tenant_id')
const studTenant = new Map((students ?? []).map(x => [x.id, x.tenant_id]))
const examTenant = new Map((exams ?? []).map(x => [x.id, x.tenant_id]))
let tenantMismatch = 0
for (const m of marks ?? []) {
  if (studTenant.get(m.student_id) !== m.tenant_id || examTenant.get(m.exam_id) !== m.tenant_id) tenantMismatch++
}
out.marks_tenant_mismatch = tenantMismatch
// score bounds
let outOfRange = 0
for (const m of marks ?? []) if (m.score === null || m.score < 0 || m.score > 100) outOfRange++
out.marks_out_of_range = outOfRange
console.log(JSON.stringify(out, null, 2))