-- Separate "Totals" grading scale keyed to raw aggregate marks.
-- Learning-area grading (0-100 per subject) stays in report_grading_levels;
-- this table holds the overall / total bands expressed on raw total marks
-- against a template-level reference maximum (e.g. "total out of 700").
-- At runtime each assessment's true maximum (learning areas x 100) is scaled
-- into the reference frame, so one template works for any class scope.

create table if not exists public.report_total_grading_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_template_id uuid not null references public.report_templates(id) on delete cascade,
  reference_maximum numeric(7,2) not null,
  level_code text not null,
  min_score numeric(7,2) not null,
  max_score numeric(7,2) not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (report_template_id, level_code),
  unique (report_template_id, sort_order),
  constraint report_total_grading_levels_range_check
    check (min_score >= 0 and min_score <= max_score and max_score <= reference_maximum)
);

alter table public.report_total_grading_levels enable row level security;

create policy report_total_grading_levels_tenant
  on public.report_total_grading_levels
  for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create index if not exists report_total_grading_levels_template_sort_idx
  on public.report_total_grading_levels (report_template_id, sort_order);

-- Atomic replacement of a template's totals grading levels (one transaction:
-- delete then insert), mirroring save_grading_levels for the totals scale.
create or replace function public.save_total_grading_levels(
  p_template_id uuid,
  p_reference_maximum numeric,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.my_tenant_id();
begin
  if not exists (
    select 1 from public.report_templates t
    where t.id = p_template_id and t.tenant_id = v_tenant_id
  ) then
    raise exception 'unauthorized report template';
  end if;
  if p_reference_maximum is null or p_reference_maximum <= 0 then
    raise exception 'reference maximum must be positive';
  end if;
  if p_rows is null or jsonb_array_length(p_rows) < 4 or jsonb_array_length(p_rows) > 8 then
    raise exception 'configure 4 to 8 total grading levels';
  end if;

  delete from public.report_total_grading_levels where report_template_id = p_template_id;
  insert into public.report_total_grading_levels
    (tenant_id, report_template_id, reference_maximum, level_code, min_score, max_score, description, sort_order)
  select
    v_tenant_id, p_template_id, p_reference_maximum,
    (r.level_code)::text, (r.min_score)::numeric, (r.max_score)::numeric,
    (r.description)::text, (r.sort_order)::int
  from jsonb_to_recordset(p_rows) as r(
    level_code text, min_score numeric, max_score numeric, description text, sort_order int
  );
end;
$$;

revoke all on function public.save_total_grading_levels(uuid, numeric, jsonb) from public;
grant execute on function public.save_total_grading_levels(uuid, numeric, jsonb) to authenticated;