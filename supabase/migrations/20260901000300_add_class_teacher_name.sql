-- Editable class teacher and principal names shown on report forms.
alter table public.classes
  add column if not exists teacher_name text;
alter table public.classes
  add column if not exists principal_name text;