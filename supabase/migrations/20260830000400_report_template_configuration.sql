create table if not exists public.report_template_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_template_id uuid not null references public.report_templates(id) on delete cascade,
  opening_date date,
  closing_date date,
  teacher_remarks_enabled boolean not null default true,
  principal_remarks_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_template_id),
  unique (tenant_id, report_template_id)
);

create table if not exists public.report_grading_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_template_id uuid not null references public.report_templates(id) on delete cascade,
  level_code text not null,
  min_score numeric(5,2) not null,
  max_score numeric(5,2) not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (report_template_id, level_code),
  constraint report_grading_levels_range_check check (min_score >= 0 and max_score <= 100 and min_score <= max_score)
);

create table if not exists public.report_teacher_remarks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_template_id uuid not null references public.report_templates(id) on delete cascade,
  remark text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (report_template_id, sort_order)
);

create table if not exists public.report_principal_remarks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_template_id uuid not null references public.report_templates(id) on delete cascade,
  remark text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (report_template_id, sort_order)
);

alter table public.report_template_configs enable row level security;
alter table public.report_grading_levels enable row level security;
alter table public.report_teacher_remarks enable row level security;
alter table public.report_principal_remarks enable row level security;

create policy report_template_configs_tenant on public.report_template_configs for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy report_grading_levels_tenant on public.report_grading_levels for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy report_teacher_remarks_tenant on public.report_teacher_remarks for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy report_principal_remarks_tenant on public.report_principal_remarks for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());

create index if not exists report_grading_levels_template_sort_idx on public.report_grading_levels(report_template_id, sort_order);
create index if not exists report_teacher_remarks_template_sort_idx on public.report_teacher_remarks(report_template_id, sort_order);
create index if not exists report_principal_remarks_template_sort_idx on public.report_principal_remarks(report_template_id, sort_order);

create or replace function public.validate_report_template_configuration(p_template_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare
  grading_count integer;
  teacher_count integer;
  principal_count integer;
  overlap_count integer;
begin
  select count(*) into grading_count from public.report_grading_levels where report_template_id=p_template_id;
  select count(*) into teacher_count from public.report_teacher_remarks where report_template_id=p_template_id;
  select count(*) into principal_count from public.report_principal_remarks where report_template_id=p_template_id;
  if grading_count < 4 or grading_count > 8 then raise exception 'Grading levels must contain between 4 and 8 rows'; end if;
  if teacher_count < 4 or teacher_count > 8 then raise exception 'Class teacher remarks must contain between 4 and 8 rows'; end if;
  if principal_count < 4 or principal_count > 8 then raise exception 'Principal remarks must contain between 4 and 8 rows'; end if;
  select count(*) into overlap_count
  from public.report_grading_levels a
  join public.report_grading_levels b on a.report_template_id=b.report_template_id and a.id < b.id
  where a.report_template_id=p_template_id and a.min_score <= b.max_score and b.min_score <= a.max_score;
  if overlap_count > 0 then raise exception 'Grading ranges must not overlap'; end if;
end;
$$;
revoke all on function public.validate_report_template_configuration(uuid) from public;
grant execute on function public.validate_report_template_configuration(uuid) to authenticated;
