-- Add Test Exam as a distinct assessment component.
-- IMPORTANT:
--   * Existing exams are NOT modified.
--   * Existing marks/results are NOT modified.
--   * Existing NULL assessment_component values remain NULL.
--   * TEST EXAM is independent from MID TERM and END TERM.

alter table public.exams
  drop constraint if exists exams_assessment_component_check;

alter table public.exams
  add constraint exams_assessment_component_check
  check (
    assessment_component is null
    or assessment_component in ('test_exam', 'mid_term', 'end_term')
  );

create index if not exists exams_tenant_component_term_idx
  on public.exams(
    tenant_id,
    assessment_component,
    term,
    academic_year,
    created_at desc
  );
