create table if not exists public.grading_scales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  grade text not null,
  min_score numeric(5,2) not null,
  max_score numeric(5,2) not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, grade),
  constraint grading_scales_range_check check (min_score >= 0 and max_score <= 100 and min_score <= max_score)
);

alter table public.grading_scales enable row level security;
create policy grading_scales_tenant on public.grading_scales for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());

create index if not exists grading_scales_tenant_sort_idx on public.grading_scales (tenant_id, sort_order);
