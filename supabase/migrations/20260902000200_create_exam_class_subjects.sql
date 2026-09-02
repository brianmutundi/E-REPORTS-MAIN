-- Per-assessment, per-grade learning-area scope.
-- The cascade Assessment -> Grade -> Learning Area -> Learners -> Scores
-- requires the learning areas available to a grade to depend on BOTH the
-- assessment and the grade. exam_subjects alone encodes only the
-- assessment-wide subject list, so this junction is the single
-- authoritative source for "which learning areas are configured for this
-- assessment and grade".

create table if not exists public.exam_class_subjects (
  exam_id uuid not null references public.exams(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  primary key (exam_id, class_id, subject_id)
);

alter table public.exam_class_subjects enable row level security;

-- Tenant isolation: the exam, the grade and the learning area must all
-- belong to the caller's school to be readable or writable (same checks
-- already applied to exam_classes / exam_subjects / marks).
create policy exam_class_subjects_tenant on public.exam_class_subjects
  for all
  using (
    exists (select 1 from public.exams e where e.id = exam_id and e.tenant_id = public.my_tenant_id())
    and exists (select 1 from public.classes c where c.id = class_id and c.tenant_id = public.my_tenant_id())
    and exists (select 1 from public.subjects s where s.id = subject_id and s.tenant_id = public.my_tenant_id())
  )
  with check (
    exists (select 1 from public.exams e where e.id = exam_id and e.tenant_id = public.my_tenant_id())
    and exists (select 1 from public.classes c where c.id = class_id and c.tenant_id = public.my_tenant_id())
    and exists (select 1 from public.subjects s where s.id = subject_id and s.tenant_id = public.my_tenant_id())
  );

-- Backfill: every subject already assigned to an assessment becomes
-- available to every grade already assigned to that same assessment, so
-- existing schools keep their current behaviour with no data loss.
insert into public.exam_class_subjects (exam_id, class_id, subject_id)
select distinct ec.exam_id, ec.class_id, es.subject_id
from public.exam_classes ec
join public.exam_subjects es on es.exam_id = ec.exam_id
on conflict (exam_id, class_id, subject_id) do nothing;