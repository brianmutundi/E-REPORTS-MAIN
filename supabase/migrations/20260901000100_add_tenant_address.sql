-- School postal/box address shown on report forms as "P.O Box".
-- Added after 20260831000300_create_report_staff_streams.sql.
alter table public.tenants
  add column if not exists address text;