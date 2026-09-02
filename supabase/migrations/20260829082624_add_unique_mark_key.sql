alter table public.marks add constraint marks_unique_entry unique (tenant_id, exam_id, student_id, subject_id);
