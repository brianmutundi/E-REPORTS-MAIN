-- Adds the guardian/ parent mobile number used by the SMS-to-parents feature.
-- The column is optional: schools may enter numbers via the student form or the
-- student CSV import (opt-in "Parent Phone" column) without any migration of
-- existing rows.

alter table public.students
  add column if not exists guardian_phone text;