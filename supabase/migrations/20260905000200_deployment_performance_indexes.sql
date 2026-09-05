-- Targeted production indexes for hot query paths and unindexed foreign keys.
-- Additive only: no rows are modified or removed.
create index if not exists marks_tenant_exam_subject_student_idx on public.marks (tenant_id, exam_id, subject_id, student_id);
create index if not exists marks_student_id_idx on public.marks (student_id);
create index if not exists marks_subject_id_idx on public.marks (subject_id);
create index if not exists students_tenant_class_name_idx on public.students (tenant_id, class_id, full_name);
create index if not exists students_tenant_stream_name_idx on public.students (tenant_id, stream_id, full_name);
create index if not exists students_class_id_idx on public.students (class_id);
create index if not exists students_stream_id_idx on public.students (stream_id);
create index if not exists exam_classes_class_id_idx on public.exam_classes (class_id);
create index if not exists exam_subjects_subject_id_idx on public.exam_subjects (subject_id);
create index if not exists exam_class_subjects_subject_id_idx on public.exam_class_subjects (subject_id);
create index if not exists class_stream_teachers_staff_id_idx on public.class_stream_teachers (staff_id);
create index if not exists profiles_tenant_id_idx on public.profiles (tenant_id);
create index if not exists report_grading_levels_tenant_id_idx on public.report_grading_levels (tenant_id);
create index if not exists report_principal_remarks_tenant_id_idx on public.report_principal_remarks (tenant_id);
create index if not exists report_teacher_remarks_tenant_id_idx on public.report_teacher_remarks (tenant_id);
create index if not exists school_report_principals_staff_id_idx on public.school_report_principals (staff_id);
create index if not exists student_enrollments_class_id_idx on public.student_enrollments (class_id);
create index if not exists student_enrollments_stream_id_idx on public.student_enrollments (stream_id);
create index if not exists exams_tenant_created_at_idx on public.exams (tenant_id, created_at desc);
