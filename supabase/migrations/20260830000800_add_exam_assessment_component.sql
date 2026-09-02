-- Adds explicit assessment identity without changing existing exam/mark data.
-- Existing exams remain NULL so their historical behaviour is preserved.
alter table public.exams
  add column if not exists assessment_component text;

alter table public.exams
  drop constraint if exists exams_assessment_component_check;

alter table public.exams
  add constraint exams_assessment_component_check
  check (assessment_component is null or assessment_component in ('mid_term', 'end_term'));

create index if not exists exams_tenant_component_term_idx
  on public.exams(tenant_id, assessment_component, term, academic_year, created_at desc);
