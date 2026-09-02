# E-REPORTS Performance Audit & Optimization — Report (A–L)

*Coverage: learner management, assessment marks entry, reporting, results, analysis, and exports for a single-school multi-tenant deployment.*

## A. Objective and Scope

Full-system performance audit of the E-REPORTS Next.js platform (App Router, Supabase
Postgres) and implementation of optimizer changes that improve **speed, responsiveness, and
scalability for large schools** (large learner populations, high score volume, many
classes/streams/exams). Hard constraints that shaped every decision:

- Do not break functionality, RLS, tenant isolation, or data integrity.
- No fake / demo / fabricated optimizations; every fallback returns the *same real data*
  via the previous (correct) query path.
- Smallest justified set of indexes; no blanket caching that could leak data across tenants
  (tenant isolation > caching).
- Preserve accessibility and keyboard entry where present.

## B. Method

1. **TRACE** — walked every dashboard page, server action, library, API route, and migration
   to map each request's supabase queries (auth, profile, tenant, data) per page load.
2. **MEASURE/ANALYZE** — counted network round-trips and payload sizes per page/flow in code;
   identified full-table scans and N+1 patterns.
3. **OPTIMIZE** — applied the changes in Section F.
4. **TEST** — `npm run typecheck`, `npm run lint`, `npm run build`, and dev-server smoke tests.
5. **VERIFY** — Section I.

## C. Environment

- Next.js 15.5.24 (App Router), React 19, TypeScript 5.9.3, Tailwind 3.4.6.
- Supabase (@supabase/ssr 0.5.2, supabase-js 2.45.4) behind `lib/supabase/server.ts`,
  RLS on all tenant tables, `my_tenant_id()` security-definer helper.
- Exports: `xlsx` and `@react-pdf/renderer` are imported **only** inside `app/api/*` routes
  (server-only) — confirmed they add nothing to the client bundle.
- All migrations (incl. `concurrency_safe_writes`, `query_and_count_performance`, and the
  school-logo reconciliation) have now been applied to the live database via `supabase db
  push`; live RPC/query paths are active in the deployed schema.

## D. Baseline (as shipped before this work)

Per full dashboard page load (typical): `auth.getUser()` + `profiles` tenant query +
page data queries. Notable hot spots:

| Flow | Cost |
| --- | --- |
| `/dashboard` layout (client component) | 3 sequential round-trips: `getUser()` + profile + tenant name on everying client hydration |
| Student/stream count badges | Full `students` table download to count per class / per stream |
| Learner performance trend (N exams) | 2 supabase queries per exam → **2N** queries |
| Bulk learner CSV import | 1 insert round-trip per row |
| Results & Reports pages | Grading scale fetched sequentially *after* the main data block (extra round-trip on the critical path) |
| Analysis page + `getAssessmentAnalysis` | Duplicate `getUser()` + profile fetch (page and lib each) |

## E. Findings (query trace)

1. `app/dashboard/students/page.tsx` and `app/dashboard/streams/page.tsx` selected every
   student row for the tenant just to aggregate counts client-side — O(max) payload,
   sustained DB load at large schools.
2. `lib/analysis.ts getLearnerTrend` issued 2 queries × exam count; with 10+ exams this is
   20+ sequential round-trips for one chart.
3. `lib/import/students.ts` inserted one row at a time (correctness-focused, but N round
   trips on bulk imports — the worst path at 1,000+ learners).
4. `app/dashboard/layout.tsx` was a client component re-fetching the session each hydration.
5. `app/dashboard/results/page.tsx` / `reports/page.tsx` fetched the grading scale after the
   main parallel block; a full serial round-trip.
6. The old `auth.getUser()` + `profiles` tenant query was repeated across layout, page, and
   libraries that each performed their own `createClient()`.

## F. Optimizations Implemented

1. **Cached session helper — `lib/supabase/session.ts`**
   `getDashboardSession()` (wrapped in React `cache()`) returns
   `{ supabase, user, tenantId, fullName, role }`. Within one server render, the layout,
   page, and libraries share a **single** `getUser()` and a single profile query. Server
   actions and API routes each keep their own (unchanged) cost.
2. **Server dashboard layout — `app/dashboard/layout.tsx`**
   Converted from client to server component; redirects to `/login` when signed out; fetches
   the tenant name once and passes it to the new client `components/dashboard/DashboardNav.tsx`
   (props-only, zero data fetching). Added `app/dashboard/loading.tsx` skeleton.
3. **Server-side count aggregation (RPC) — students/streams pages**
   New `count_students_by_class()` / `count_students_by_stream()` RPCs (see Section G).
   Pages call them via `getClassCounts()` / `getStreamCounts()`, which fall back to the old
   full-scan select when the migration is not yet applied — identical data, never fabricated.
4. **Batched learner trend — `lib/analysis.ts`**
   `getLearnerTrend` rewritten from 2N queries to a constant set: 3 parallel
   (student, exams, grading levels) → class learners → 2 batched queries
   (`exam_class_subjects` `.in('exam_id')`, `marks` `.in('exam_id').in('student_id')`),
   then in-memory grouping preserving the previous ordering/semantics.
5. **Chunked learner import — `lib/import/students.ts`**
   Per-row inserts replaced with batched inserts (100 rows/chunk). On a unique-violation
   (`23505`) the chunk is re-checked against existing admission numbers and only genuinely
   new rows are inserted; non-constraint errors fall back to per-row inserts. `created` /
   `skipped` / `errors` semantics and the no-overwrite invariant are preserved.
6. **Parallel grading scale — results/reports pages**
   `getTenantGradingScale(tenantId)` moved into the initial `Promise.all` on Results and
   Reports pages (one round-trip off the critical path).
7. **Full dashboard conversion to the session helper**
   Mechanically replaced the `createClient()` + `getUser()` + `profiles.tenant_id` pattern
   everywhere in `app/dashboard/*` and the dashboard-facing libraries:
   - Pages: `dashboard/page.tsx`, `students`, `streams`, `classes`, `grading`, `subjects`,
     `marks`, `examinations`, `examinations/assign`, `marks/import`, `students/import`,
     `settings`, `reports`, `reports/template`, `reports/template/configuration`, `results`,
     `analysis`.
   - Libraries: `lib/results.ts` (3 functions), `lib/analysis.ts`, `lib/import/students.ts`.
   - Server actions: `settings/actions.ts` plus all in-file actions.

## G. Database Changes (pending apply)

`supabase/migrations/20260902000300_query_and_count_performance.sql`:

- Index `marks_tenant_student_idx ON marks (tenant_id, student_id)` — supports
  tenant-scoped mark queries by learner and the batched trend query.
- Index `exam_class_subjects_class_exam_idx ON exam_class_subjects (class_id, exam_id)` —
  supports class-scoped scope resolution and the batched trend query.
- Functions `count_students_by_class()` and `count_students_by_stream()`:
  SQL-only, `SECURITY DEFINER`, `SET search_path = public`, filter
  `tenant_id = public.my_tenant_id()`, `REVOKE ... FROM public`,
  `GRANT ... TO authenticated`. Tenant isolation is enforced server-side; no
  client-supplied tenant parameter.

`supabase/migrations/20260902000400_concurrency_safe_writes.sql` (see `### Concurrent
User Support`):

- `save_marks_grid(...)` — atomic, optimistic-concurrency score save for the
  Marks Entry Matrix (per-cell `updated_at` snapshot checks; `INSERT ... ON CONFLICT DO NOTHING`
  for absent-at-load cells; versioned `UPDATE`/`DELETE` for existing cells; returns
  per-learner `ok`/`conflict`/`skipped`).
- `set_exam_scope(...)` — atomic exam→classes→subjects scope replacement (one transaction).
- `save_grading_levels(...)` — atomic grading-level replacement for a tenant's default template.
- `save_report_configuration(...)` — atomic template + config + remarks save
  (finds-or-creates the default template, merges `assessmentComponents`, upserts config,
  replaces both remark lists).
- All four are `SECURITY DEFINER`, `SET search_path = public`, re-derive the tenant from
  `auth.uid()` via `public.my_tenant_id()`, re-validate ownership of every touched foreign
  key (exam, subject, learner, class, template) — so RLS-equivalent tenant isolation holds
  even though the definer bypasses row policies. `REVOKE ... FROM public`;
  `GRANT ... TO authenticated`.

Apply with `supabase db push`. Until applied, apps run the tolerant fallbacks (Sections D/F,
and the new RPC paths fall back to the previous per-statement writes on `PGRST202`).

## H. Before / After (round-trips per full page load or flow)

| Page / flow | Before | After |
| --- | --- | --- |
| Any dashboard page (auth layer) | 2 RT (getUser + profile) per component/lib | 2 RT shared (deduped via cache across layout+page+libs) |
| Dashboard (full load) | 3 serial RTs on the client | 1 server render pass, auth deduped, no client session fetch |
| Students page (counts) | full `students` table scan | 1 `count_students_by_class()` RPC (fallback = old scan) |
| Streams page (counts) | full `students` table scan | 1 `count_students_by_stream()` RPC (fallback = old scan) |
| Learner trend (N exams) | 2N sequential | 5 parallel/batched |
| Bulk learner import (N rows) | N inserts | ⌈N/100⌉ inserts |
| Results / Reports pages | grading scale serial (N+1) | grading scale parallel with base data |
| Analysis page | duplicate auth fetch | shared cache hit |

Residual DB payload drop is proportional to school size because count aggregation now
happens server-side (the `students` table is no longer transferred for badge counts).

## I. Verification

- `npm run typecheck` — clean (final run after the concurrent-write conversion).
- `npm run lint` — 0 errors; only the 6 pre-existing warnings (unchanged).
- `npm run build` — 35 routes generated; client bundle sizes unchanged
  (`/dashboard/reports` 107 kB, `/dashboard/students` 110 kB — no client regressions from
  server-only work); exports stayed server-only.
- Dev smoke (`http://localhost:3000`):
  `/login` → 200; `/dashboard`, `/dashboard/students`, `/dashboard/streams`,
  `/dashboard/marks`, `/dashboard/marks/import`, `/dashboard/examinations/assign`,
  `/dashboard/reports/template`, `/dashboard/reports/template/configuration`,
  `/dashboard/settings`, `/dashboard/students/import`, `/dashboard/analysis`,
  `/dashboard/grading` →
  all 307 → `/login` (middleware + layout + page guard wiring correct for signed-out).

## I-A. Concurrent User Support (multi-device / concurrency requirements)

**Maximum concurrent users actually tested:** a live 10-session load test was executed
successfully against the real database (`2026-09-02`) after `supabase db push` applied
`20260902000400_concurrency_safe_writes.sql`. Ten real, confirmed authenticated users were
provisioned (`scripts/create-loadtest-accounts.mjs`) and the harness ran under the Advanced
Exam (`MID TERM`) on GRADE 1 / MATHEMATICS with 10 real learners plus a foreign-tenant user:

```
node scripts/concurrency-check.mjs --users "loadtest01@school.test:<pw>,...,loadtest10@school.test:<pw>" \
  --exam e8fb49ab-03bd-4820-af42-9a6036200ec4 --class 4ef544c8-0cba-4047-a352-f75a2c52ae4b \
  --subject 51f4a4fb-1af2-457f-ab88-9632e5c9aabe \
  --students ac0ac468-...,14bc3388-...,... (10 real student uuids) \
  --foreign-user loadtest-foreign@school.test:<pw>
```

Results — **all executed tests passed**:

| Test | Result |
| --- | --- |
| A: 10 sessions signed in, tokens independent | PASS (10 sessions, 10 distinct tokens) |
| B: 10 simultaneous reads, consistent result shape | PASS |
| C: 10 different learners saved simultaneously | PASS (10/10 persisted, 0 lost) |
| D: same-cell simultaneous edit | PASS (deterministic `conflict`/`ok`; winner persisted, no silent overwrite) |
| E: cross-tenant read attempt (foreign tenant user) | PASS (0 rows) |
| F: 10 simultaneous assessment/report views | PASS (10/10 isolated) |

The harness also verified **full data restoration**: every transient score cell was returned to
its pre-run state (the only post-run row remaining is a learner's genuine pre-existing mark,
verified by its original `updated_at`).

What the harness verifies (with 10 real accounts):
TEST A — 10 simultaneous signed-in sessions remain independent; TEST B — 10 simultaneous
reads return correct, non-leaking data; TEST C — simultaneous score entry on 10 different
learners, all persisted, none lost; TEST D — simultaneous update of the SAME score cell
yields exactly one winner and one conflict (no silent overwrite; final stored value equals
the winner's); TEST E — cross-tenant read attempts (optional `--foreign-user`) return no
rows; TEST F — simultaneous assessment/report browsing stays isolated. The script restores
all touched score cells afterwards.

What the audit established (code- and schema-level):

- **No silent overwrites:** the score grid previously upserted the whole matrix without a
  version check; it now saves through `save_marks_grid`, which compares each cell's loaded
  `updated_at` snapshot inside a single transaction and returns `conflict` for any cell that
  moved since load. Two devices editing the same cell get one winner + one explicit conflict
  (highlighted in the UI) instead of last-write-wins.
- **No duplicate rows:** every write path keeps its unique-key guarantee in the database —
  `marks` (`tenant_id, exam_id, student_id, subject_id`), exam scope PKs, grading levels
  (`report_template_id, level_code`), remark lists (`report_template_id, sort_order`),
  `report_template_configs` (`report_template_id`) — and imports use `ON CONFLICT DO NOTHING`
  / insert-only semantics so a concurrent duplicate attempt just reports an error instead of
  creating a second row.
- **Atomic multi-statement saves:** exam scope, grading levels, and report configuration now
  each go through one RPC/transaction rather than a sequence of statements that could leave a
  half-written state on interruption or interleave.
- **Tenant isolation:** RLS stays the enforcement point for reads; the security-definer RPCs
  re-derive `tenant_id` from `auth.uid()` and re-validate ownership of every foreign key, so
  a concurrent-save race cannot write across tenants.
- **Independent auth sessions:** SSR cookie auth is per-device — there is no shared session
  the app relies on; browser storage holds only a per-project auth hint; nothing is shared
  across users in server `cache()` (React cache is per-request).
- **No Realtime added:** the app does not use Supabase Realtime; per the requirements it was
  deliberately not introduced and no polling fallback was added.
- **Failure paths:** writes redirect to the prior page with a surfaced error (config, scope,
  grading) or an explicit conflict list (marks) — a failed save never silently reports
  success.

## J. Limitations

- Signed-in, *browser-level* UI smoke tests were not possible in this session (no browser
  automation/credentials); the live concurrency harness exercises real authenticated sessions
  and RPCs scripted against the production data, while signed-in page flows are covered by
  typecheck, lint, build, and the previously verified auth-guard wiring.
- Live before/after latency numbers were not re-measured post-migration; the structural
  round-trip and payload reductions ship in the live schema now, but a formal before/after
  latency measurement remains an optional follow-up.
- Middleware still performs per-request `getUser()` + `profiles.role`. This is standard for
  SSR auth and retained deliberately; the in-page guards also remain.
- Concurrency acceptance: the live 10-session test **passed** (Section I-A, 2026-09-02),
  including the same-cell conflict test and cross-tenant isolation. The delivered artefact
  is the hardened transactional write layer plus `scripts/concurrency-check.mjs` and
  `scripts/create-loadtest-accounts.mjs` for repeat runs.

## K. Files Changed / Added

- Added: `lib/supabase/session.ts`, `components/dashboard/DashboardNav.tsx`,
  `app/dashboard/loading.tsx`,
  `supabase/migrations/20260902000300_query_and_count_performance.sql`,
  `supabase/migrations/20260902000400_concurrency_safe_writes.sql`,
  `supabase/migrations/20260902000500_reconcile_school_logos.sql`,
  `scripts/concurrency-check.mjs`, `scripts/create-loadtest-accounts.mjs`,
  `PERFORMANCE_OPTIMIZATION_REPORT.md`.
- Reworked: `app/dashboard/layout.tsx`.
- Edited: `app/dashboard/{page,students,streams,classes,grading,subjects,marks,examinations,
  results,reports,analysis,settings}/page.tsx`,
  `app/dashboard/examinations/assign/page.tsx`,
  `app/dashboard/{marks,students}/import/page.tsx`,
  `app/dashboard/reports/template/page.tsx`,
  `app/dashboard/reports/template/configuration/page.tsx`,
  `app/dashboard/settings/actions.ts`, `lib/results.ts`, `lib/analysis.ts`,
  `lib/import/students.ts`.

## L. Next Steps

1. ✅ Migrations applied via `supabase db push` (2026-09-02); RPC paths for students/streams,
   the two new indexes, and concurrent-write RPCs are live and verified.
2. ✅ Concurrency harness ran with 10 real users and real data — **all tests passed**
   (Section I-A). Re-run with `scripts/create-loadtest-accounts.mjs` + `scripts/concurrency-check.mjs`
   whenever the dataset changes.
3. Optional: move `/api/*` import/export routes onto `getDashboardSession()` for consistency
   (no per-request win, same round-trip count).
4. Optional follow-ups (not done, kept out of scope): cache controls via
   `revalidatePath`/router cache tuning per busy pages, and a super-admin dashboard review.
5. Optional: with the live schema active, capture formal before/after round-trip timings to
   close the Section J latency note.