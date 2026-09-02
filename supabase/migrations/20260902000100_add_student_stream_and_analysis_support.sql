-- Adds an optional stream link on students so reports/analysis can compute
-- Stream Position (rank within a stream) and Grade Position (rank across all
-- streams of a grade). Existing students with no stream remain valid.
alter table public.students
  add column if not exists stream_id uuid references public.streams(id) on delete set null;

create index if not exists students_tenant_class_idx on public.students (tenant_id, class_id);
create index if not exists students_tenant_stream_idx on public.students (tenant_id, stream_id);