-- Query and counting performance.
-- Adds two small, targeted indexes and server-side aggregate functions so
-- roster/stream pages never download the whole students table for counts.

create index if not exists marks_tenant_student_idx on public.marks (tenant_id, student_id);

create index if not exists exam_class_subjects_class_exam_idx on public.exam_class_subjects (class_id, exam_id);

create or replace function public.count_students_by_class()
returns table (class_id uuid, learner_count bigint)
language sql stable security definer set search_path = public
as $$
  select s.class_id, count(*)::bigint
  from public.students s
  where s.tenant_id = public.my_tenant_id()
    and s.class_id is not null
  group by s.class_id
$$;

revoke all on function public.count_students_by_class() from public;
grant execute on function public.count_students_by_class() to authenticated;

create or replace function public.count_students_by_stream()
returns table (stream_id uuid, learner_count bigint)
language sql stable security definer set search_path = public
as $$
  select s.stream_id, count(*)::bigint
  from public.students s
  where s.tenant_id = public.my_tenant_id()
    and s.stream_id is not null
  group by s.stream_id
$$;

revoke all on function public.count_students_by_stream() from public;
grant execute on function public.count_students_by_stream() to authenticated;