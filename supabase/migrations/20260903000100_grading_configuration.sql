-- Configurable 4-level / 8-level CBE grading system.
--
-- Adds a single authoritative grading CONFIGURATION per tenant (mode + levels),
-- replacing the implicit "4 rows hard-coded in the UI / report_grading_levels"
-- model with an explicit, editable, mode-aware definition.
--
-- The `marks` table stores ONLY raw numeric scores; achievement levels are
-- computed at read time from this configuration. Therefore switching the mode
-- needs NO data migration of marks or results. See docs/grading-system-spec.md §0.2.
--
-- REVERSIBLE: see down-migration at the end of this file (drop config table +
-- function). No existing data is truncated or rewritten.

-- ─────────────────────────────────────────────────────────────
-- 1. grading_configurations (one active config per tenant)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.grading_configurations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mode text not null default '4' check (mode in ('4', '8')),
  active boolean not null default false,
  legacy_source boolean not null default false, -- true when populated from report_grading_levels
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active configuration per tenant; multiple inactive rows may exist to
-- preserve history for rollback (spec §31).
create unique index grading_configurations_one_active
  on public.grading_configurations (tenant_id) where (active = true);

-- ─────────────────────────────────────────────────────────────
-- 2. grading_configuration_levels (the levels inside a config)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.grading_configuration_levels (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references public.grading_configurations(id) on delete cascade,
  code text not null,            -- display code: EE / ME / AE / BE or EE1..BE2
  min_percent numeric(5,2) not null check (min_percent >= 0 and min_percent <= 100),
  max_percent numeric(5,2) not null check (max_percent <= 100),
  points integer,                -- KNEC points (8-level); NULL for 4-level
  name text not null,            -- display name e.g. "Exceeding Expectations 1"
  description text not null default '',
  broad text,                    -- broad category EE/ME/AE/BE (8-level grouping)
  sort_order integer not null default 0,
  color text not null default '#64748b',
  constraint grading_levels_min_le_max check (min_percent <= max_percent),
  unique (config_id, code),
  unique (config_id, sort_order)
);

create index grading_configuration_levels_config_sort_idx
  on public.grading_configuration_levels (config_id, sort_order);

alter table public.grading_configurations enable row level security;
alter table public.grading_configuration_levels enable row level security;

create policy grading_configurations_tenant
  on public.grading_configurations
  for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy grading_configuration_levels_tenant
  on public.grading_configuration_levels
  for all
  using (config_id in (select id from public.grading_configurations where tenant_id = public.my_tenant_id()))
  with check (config_id in (select id from public.grading_configurations where tenant_id = public.my_tenant_id()));

-- Keep updated_at fresh on configuration edits.
create or replace function public.touch_grading_configuration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.grading_configurations set updated_at = now() where id = new.config_id;
  return new;
end;
$$;

drop trigger if exists grading_levels_touch_config on public.grading_configuration_levels;
create trigger grading_levels_touch_config
  after insert or update or delete on public.grading_configuration_levels
  for each row execute function public.touch_grading_configuration();

-- ─────────────────────────────────────────────────────────────
-- 3. Helper: default KNEC 8-level levels (superset)
--    Both 4- and 8-level modes derive their default rows from these.
-- ─────────────────────────────────────────────────────────────
create or replace function public.knec_default_levels(p_mode text default '8')
returns jsonb
language sql
stable
as $$
  select case
    when p_mode = '8' then (
      -- KNEC KJSEA 8-level defaults. The min-percentage is the authoritative
      -- lower bound of each band under the closed-open rule (min ≤ x < next.min);
      -- the shown max is descriptive (the top band is closed at 100).
      select jsonb_build_array(
        jsonb_build_object('code','EE1','min_percent',90,'max_percent',100,'points',8,'name','Exceeding Expectations 1','broad','EE'),
        jsonb_build_object('code','EE2','min_percent',75,'max_percent',89,'points',7,'name','Exceeding Expectations 2','broad','EE'),
        jsonb_build_object('code','ME1','min_percent',58,'max_percent',74,'points',6,'name','Meeting Expectations 1','broad','ME'),
        jsonb_build_object('code','ME2','min_percent',41,'max_percent',57,'points',5,'name','Meeting Expectations 2','broad','ME'),
        jsonb_build_object('code','AE1','min_percent',31,'max_percent',40,'points',4,'name','Approaching Expectations 1','broad','AE'),
        jsonb_build_object('code','AE2','min_percent',21,'max_percent',30,'points',3,'name','Approaching Expectations 2','broad','AE'),
        jsonb_build_object('code','BE1','min_percent',11,'max_percent',20,'points',2,'name','Below Expectations 1','broad','BE'),
        jsonb_build_object('code','BE2','min_percent',0,'max_percent',10,'points',1,'name','Below Expectations 2','broad','BE')
      )
    )
    else (
      -- 4-level derived by collapsing each 8-level pair (top closed at 100)
      select jsonb_build_array(
        jsonb_build_object('code','EE','min_percent',75,'max_percent',100,'points',null,'name','Exceeding Expectations','broad','EE'),
        jsonb_build_object('code','ME','min_percent',41,'max_percent',74,'points',null,'name','Meeting Expectations','broad','ME'),
        jsonb_build_object('code','AE','min_percent',21,'max_percent',40,'points',null,'name','Approaching Expectations','broad','AE'),
        jsonb_build_object('code','BE','min_percent',0,'max_percent',20,'points',null,'name','Below Expectations','broad','BE')
      )
    )
  end
$$;

grant execute on function public.knec_default_levels(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Upsert a config (mode + levels) in one transaction.
--    Deactivates other configs for the tenant; sets this one active.
-- ─────────────────────────────────────────────────────────────
create or replace function public.upsert_grading_configuration(
  p_mode text,
  p_levels jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.my_tenant_id();
  v_config_id uuid;
  v_level record;
  v_min numeric; v_max numeric; v_points integer;
  v_code text; v_name text; v_desc text; v_broad text; v_ord integer; v_color text;
begin
  if v_tenant_id is null then
    raise exception 'no school linked';
  end if;
  update public.grading_configurations set active = false where tenant_id = v_tenant_id;

  insert into public.grading_configurations (tenant_id, mode, active, legacy_source)
  values (v_tenant_id, p_mode, true, false)
  returning id into v_config_id;

  for v_level in
    select * from jsonb_to_recordset(p_levels) as x(
      code text, min_percent numeric, max_percent numeric, points integer,
      name text, description text, broad text, sort_order int, color text
    )
  loop
    v_code  := coalesce(v_level.code, '');
    if v_code = '' then
      raise exception 'level code is required';
    end if;
    v_min    := coalesce(v_level.min_percent, -1);
    v_max    := coalesce(v_level.max_percent, -1);
    v_points := v_level.points;
    v_name   := coalesce(v_level.name, v_code);
    v_desc   := coalesce(v_level.description, '');
    v_broad  := v_level.broad;
    v_ord    := coalesce(v_level.sort_order, 0);
    v_color  := coalesce(v_level.color, '#64748b');
    if v_min < 0 or v_max > 100 or v_min > v_max then
      raise exception 'invalid range for level %', v_code;
    end if;
    insert into public.grading_configuration_levels
      (config_id, code, min_percent, max_percent, points, name, description, broad, sort_order, color)
    values (v_config_id, v_code, v_min, v_max, v_points, v_name, v_desc, v_broad, v_ord, v_color);
  end loop;

  return v_config_id;
end;
$$;

grant execute on function public.upsert_grading_configuration(text, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. Load the active config (with levels) for the current tenant as JSON.
--    Returns NULL when none exists.
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_active_grading_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'mode', c.mode,
    'levels', (
      select jsonb_agg(
        jsonb_build_object(
          'code', l.code,
          'min_percent', l.min_percent,
          'max_percent', l.max_percent,
          'points', l.points,
          'name', l.name,
          'description', l.description,
          'broad', l.broad,
          'sort_order', l.sort_order,
          'color', l.color
        ) order by l.sort_order
      )
      from public.grading_configuration_levels l
      where l.config_id = c.id
    )
  )
  from public.grading_configurations c
  where c.tenant_id = public.my_tenant_id() and c.active = true
  limit 1
$$;

grant execute on function public.get_active_grading_configuration() to authenticated;

-- =============================================================
-- DOWN-MIGRATION (rollback per spec §31)
-- Restores the previous (no explicit config) state. Existing marks and
-- report_grading_levels are untouched; those remain the pre-feature fallback.
-- =============================================================
-- drop function if exists public.get_active_grading_configuration();
-- drop function if exists public.upsert_grading_configuration(text, jsonb);
-- drop function if exists public.knec_default_levels(text);
-- drop trigger if exists grading_levels_touch_config on public.grading_configuration_levels;
-- drop function if exists public.touch_grading_configuration();
-- drop table if exists public.grading_configuration_levels;
-- drop table if exists public.grading_configurations;
-- (do NOT drop public.my_tenant_id) —
