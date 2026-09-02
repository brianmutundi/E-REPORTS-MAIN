-- Student deletion must never cascade-delete historical marks.
-- The existing students -> marks relationship used ON DELETE CASCADE,
-- which made the Students delete action unsafe for students with marks.
-- Preserve all existing rows and change only the foreign-key behavior.

alter table public.marks
  drop constraint if exists marks_student_id_fkey;

alter table public.marks
  add constraint marks_student_id_fkey
  foreign key (student_id)
  references public.students(id)
  on delete restrict;
