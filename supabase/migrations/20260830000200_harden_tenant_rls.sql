drop policy if exists exam_classes_tenant on public.exam_classes;
create policy exam_classes_tenant on public.exam_classes
for all
using (
  exists (select 1 from public.exams e where e.id = exam_id and e.tenant_id = public.my_tenant_id())
  and exists (select 1 from public.classes c where c.id = class_id and c.tenant_id = public.my_tenant_id())
)
with check (
  exists (select 1 from public.exams e where e.id = exam_id and e.tenant_id = public.my_tenant_id())
  and exists (select 1 from public.classes c where c.id = class_id and c.tenant_id = public.my_tenant_id())
);

drop policy if exists exam_subjects_tenant on public.exam_subjects;
create policy exam_subjects_tenant on public.exam_subjects
for all
using (
  exists (select 1 from public.exams e where e.id = exam_id and e.tenant_id = public.my_tenant_id())
  and exists (select 1 from public.subjects s where s.id = subject_id and s.tenant_id = public.my_tenant_id())
)
with check (
  exists (select 1 from public.exams e where e.id = exam_id and e.tenant_id = public.my_tenant_id())
  and exists (select 1 from public.subjects s where s.id = subject_id and s.tenant_id = public.my_tenant_id())
);

drop policy if exists marks_tenant on public.marks;
create policy marks_tenant on public.marks
for all
using (
  tenant_id = public.my_tenant_id()
  and exists (select 1 from public.exams e where e.id = exam_id and e.tenant_id = public.my_tenant_id())
  and exists (select 1 from public.students s where s.id = student_id and s.tenant_id = public.my_tenant_id())
  and exists (select 1 from public.subjects s where s.id = subject_id and s.tenant_id = public.my_tenant_id())
)
with check (
  tenant_id = public.my_tenant_id()
  and exists (select 1 from public.exams e where e.id = exam_id and e.tenant_id = public.my_tenant_id())
  and exists (select 1 from public.students s where s.id = student_id and s.tenant_id = public.my_tenant_id())
  and exists (select 1 from public.subjects s where s.id = subject_id and s.tenant_id = public.my_tenant_id())
);
