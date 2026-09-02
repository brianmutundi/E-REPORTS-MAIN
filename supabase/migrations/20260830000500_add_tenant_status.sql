-- The super-admin dashboard (app/super-admin/dashboard) reads/writes
-- tenants.status ('active' | 'inactive') to onboard schools and toggle
-- access, but no prior migration defined this column. Add it now,
-- defaulting existing rows to 'active' so current tenants are unaffected.

alter table public.tenants
  add column if not exists status text not null default 'active';

alter table public.tenants
  drop constraint if exists tenants_status_check;

alter table public.tenants
  add constraint tenants_status_check check (status in ('active', 'inactive'));

create index if not exists tenants_status_idx on public.tenants (status);
