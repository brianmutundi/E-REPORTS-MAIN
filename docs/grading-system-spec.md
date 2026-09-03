# E-REPORTS — Configurable 4-Level / 8-Level CBE Grading System

> Reference spec (kept in repo per the task §32). Also contains the pre-implementation
> findings required by §22 step 6 and §9.

---

## 0. Pre-Implementation Findings (written BEFORE any code changed)

This satisfies the task's requirement: *"Before modifying anything, inspect the existing
database schema, grading logic, assessment calculations, report generation, broadsheets,
analysis, settings, and UI. Write a short findings summary (what exists today, what will
change), before touching code."*

### 0.1 What exists today

- **Marks storage (`marks` table):** stores only raw `score` numeric(5,2) CHECK 0–100, plus
  `exam_id`, `student_id`, `subject_id`, `tenant_id`. There is **no** `grade`, `achievement_level`,
  or `grading_level` column.
- **Achievement levels are CALCULATED at runtime, never stored per row.** This is the decisive
  finding for §9: the grading mode can be switched with **zero data migration**. Reports and
  analysis simply recalculate against whichever configuration is active at read time.

### 0.2 §9 ANSWER (required written answer)

> **Are achievement levels currently stored on each result row or calculated dynamically?**

**Calculated dynamically.** The `marks` table stores only raw numeric scores. Every grade /
overall level is recomputed on read from the score + the active grading scale
(`getGrade`, `getTotalLevel`, `getTenantGradingScale`, `getTenantTotalGradingScale`).

**Implication:** switching from 4-level to 8-level (or back) requires **no data migration**.
Past reports viewed after a mode change will reflect the configured mode at the time they are
rendered. No historical assessment result rows are stored with a grade, so there is nothing to
version, recalculate, or corrupt. `marks` rows are never rewritten by this feature. The task's
"do not silently recalculate historical results / never corrupt historical data" requirement
is satisfied trivially because historical data (scores) is immutable and interpretation-only.

### 0.3 Current configuration storage model

| Location | Purpose | Scope |
|---|---|---|
| `report_grading_levels` | Per-learning-area bands (0–100 per subject) | Per default report template |
| `report_total_grading_levels` | Overall/totals bands (raw marks vs `reference_maximum`) | Per default report template |
| `report_templates.template_json` | Visibility toggles + assessment components | Per template |
| `report_template_configs` | Term dates, remark enable/disable | Per template |
| `GRADING_SCALE` (hardcoded in `lib/grading.ts`) | Fallback EE/ME/AE/BE @ 80/60/40/0 | Global default |
| `grading_scales` (DB table) | **Legacy / unused** — no app code reads it | Tenant-level orphan |

Each tenant has exactly one default report template (partial unique index on `is_default`).
All grading rows are scoped to that template id.

### 0.4 Grading mode concept

**There is no grading-mode concept anywhere today.** The system only ever has one scale shape:
per-subject 0–100 plus an optional totals overlay. This feature introduces the 4-level vs
8-level mode as a first-class per-tenant setting.

### 0.5 Audit of hardcoded grading logic (§25 input)

| File | Lines | Hardcoded? | Action |
|---|---|---|---|
| `lib/grading.ts` | 3–8 | `GRADING_SCALE` default | Keep as legacy fallback, redesign `getTenantGradingScale` to read the mode |
| `lib/analysis-types.ts` | 6–23 | `LEVEL_COLOR`, `LEVEL_DEFAULT` | Keyed only EE/ME/AE/BE; extend to 8 codes + make color assignment config/order-driven |
| `lib/analysis.ts` | 235–239 | fallback + `['EE','ME','AE','BE']` order | Replace with data from active grading config |
| `app/dashboard/grading/page.tsx` | 8–25 | `DEFAULT_LEVELS`, `DEFAULT_TOTAL_LEVELS` | Replaced by KNEC/mode defaults from the config engine |
| `app/dashboard/reports/template/page.tsx` | 53 | static preview text `ME`/`BE` | Keep as illustrative preview, or derive from live scale |

All runtime **consumers** (`lib/results.ts`, `lib/analysis.ts`, PDF routes, results/reports/analysis
pages) already call `getTenantGradingScale`/`getTotalLevel` and carry **no** hardcoded levels, so
they adapt automatically once the engine understands mode.

### 0.6 What will change

1. **New `grading_configurations` table** — one row per tenant holding the active `mode`
   (`'4'` or `'8'`), one authoritative source for level definitions (code, min %, max %,
   points, display name, description, sort order, broad-category colour). Backed by the
   existing `report_grading_levels`-style config but consolidated.
2. **Central grading engine** (`lib/grading.ts`) — add `calculateAchievement(percent, config)`
   and make `getTenantGradingScale` return the mode-aware level list. All consumers run through it.
3. **Grading settings UI** — mode selection cards, KNEC 8-level default load, 4-level derived
   defaults, editable table, validation, Restore KNEC Defaults, explicit Save, mode-change
   confirmation.
4. **Consumers** (reports `page.tsx`, `api/reports/pdf`, `api/results/export/pdf`,
   `api/analysis/export/pdf`, `lib/results.ts`, `lib/analysis.ts`, broadsheet) — continue to
   read the scale through the engine; adapt the performance-level key, orders, and colours to
   mode; add exam-type label (§13a) and mode-aware remarks (§11a).
5. **Migration** — reversible (down-migration provided per §31).

---

## 1. Core Requirement

Two grading modes (see main spec §1):
- **Mode A — 4 Performance Levels:** EE, ME, AE, BE
- **Mode B — 8 Actual Performance Levels:** EE1/EE2, ME1/ME2, AE1/AE2, BE1/BE2

Admin chooses the mode BEFORE configuring ranges.

## 2. Grading Mode Selection

Configured interface under `/dashboard/grading`. Polished cards (not a raw dropdown).

## 3. KNEC Defaults (8-Level)

Loaded automatically when 8-level mode is selected. Editable. Labelled "KNEC Default".

## 4. Four-Level Defaults

Derived by collapsing the 8-level pairs (see main spec §4 table). Editable, independent of
edited 8-level ranges.

## 5. Editable Configuration

Table of Code / Achievement Level / Minimum / Maximum / Points (8-level) with:
- **Restore KNEC Defaults** (current mode only)
- **Save Grading Configuration** (explicit, with success/failure feedback)

## 6. Validation

See main spec §6. Closed-open boundary rule: `min ≤ score < next.min`, top level closed both
ends at 100. Friendly messages, no raw DB errors.

## 7..8. Tenant Scoping & Active Configuration

One active `grading_configurations` row per tenant, RLS enforced via `my_tenant_id()`.

## 9. Mode Switching

Confirmation dialog. Dynamic re-interpretation (see §0.2) — no data migration.

## 10. One Authoritative Grading Engine

`calculateAchievement(percentage, configLevels) → level`. All surfaces use it.

## 11. Learning Area Results / 11a. Remarks / 12. Overall

Mode controls learning-area levels; totals use same engine; remarks read the actual
configured level label/description, not a hard-coded phrase.

## 13. Assessment Reports / 13a. Exam-Type Label

Reports show the mode's level set and the actual assessment name/type. No denominator
formats (`100/200`). No position/ranking reintroduced.

## 14..17. Broad Grouping, Analysis, Broadsheet, Dashboard/Charts

8-level mode preserves EE=EE1+EE2 (etc.) for analysis/aggregation. Broadsheet and dashboard
adapt automatically. Charts: correct labels/counts/percentages, no hard-coded samples,
accessible, responsive.

## 18. Absent / Missing Marks

blank = absent; never zero; absent learners excluded from aggregates (already true).

## 19. Cascading Assessment Scope

Assessment → Grade → Learning Area → Learners must be preserved.

## 20..21. UI/UX & Mobile

Professional education-product styling; responsive at 375/768/1024/1440; tables restructure
into stacked cards on small screens; Lucide icons; no emoji as interface icons.

## 22..23. Migration Safety & Existing Data

Alignment with §0.2. Migration is reversible. Scores unchanged. See §31.

## 24. Error Handling

Friendly DB-error messages only (reuse `lib/db-errors.ts`).

## 25. Audit

See §0.5.

## 26..29. Tests, Boundaries, Isolation, Performance

- §26: test both modes end-to-end.
- §27: boundary values 0,10,11,20,21,30,31,40,41,57,58,74,75,89,90,100 map to exactly one level.
- §28: two tenants with different modes stay isolated.
- §29: load config once per request; reuse across learners; no N+1.

## 30. Final QA

Lint, typecheck, build; manual test sweep (list in main spec §30).

## 31. Rollback Plan

- Every migration ships a down-migration.
- Production backup before applying.
- Prior grading state kept retrievable for ≥1 full grading cycle (the `grading_configurations`
  row and its level history are preserved by the down-migration).

## 32. Definition of Done

Acceptance criteria per main spec §32 plus this file kept as reference spec.
