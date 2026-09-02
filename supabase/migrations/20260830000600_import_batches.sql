-- Bulk import (Students and Results/Marks) is a first-class, high-risk
-- write workflow per CLAUDE.md and must be auditable: who imported what,
-- when, for which tenant/academic context, and whether it succeeded or
-- produced rejected rows. No such table existed previously.

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null,
  performed_by uuid references public.profiles(id) on delete set null,
  exam_id uuid references public.exams(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  filename text,
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'completed',
  error_report jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint import_batches_kind_check check (kind in ('students', 'results')),
  constraint import_batches_status_check check (status in ('completed', 'failed', 'rejected'))
);

alter table public.import_batches enable row level security;

create policy import_batches_tenant on public.import_batches
  for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create index if not exists import_batches_tenant_created_idx
  on public.import_batches (tenant_id, created_at desc);
