-- Harden the configurable 4-level / 8-level grading contract.
--
-- This migration does not modify marks, results, students, assessments, or
-- existing grading configuration data. It only hardens the write RPC so the
-- database independently enforces the same invariants as the UI.

create or replace function public.upsert_grading_configuration(
  p_mode text,
  p_levels jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.my_tenant_id();
  v_config_id uuid;
  v_level record;
  v_expected_count integer;
  v_count integer;
  v_min numeric;
  v_max numeric;
  v_points integer;
  v_code text;
  v_name text;
  v_desc text;
  v_broad text;
  v_ord integer;
  v_color text;
  v_previous_min numeric := null;
  v_previous_max numeric := null;
  v_seen_codes text[] := array[]::text[];
  v_seen_orders integer[] := array[]::integer[];
begin
  -- Only a tenant administrator may change school grading configuration.
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.tenant_id = v_tenant_id
  ) then
    raise exception 'only a school administrator can change grading configuration';
  end if;

  if p_mode not in ('4', '8') then
    raise exception 'grading mode must be 4 or 8';
  end if;

  if p_levels is null or jsonb_typeof(p_levels) <> 'array' then
    raise exception 'grading levels must be a JSON array';
  end if;

  v_expected_count := case when p_mode = '4' then 4 else 8 end;
  v_count := jsonb_array_length(p_levels);

  if v_count <> v_expected_count then
    raise exception 'grading mode % requires exactly % levels; received %', p_mode, v_expected_count, v_count;
  end if;

  -- Validate every level before changing the active configuration. This is
  -- important because the previous implementation deactivated the current
  -- config before discovering malformed input.
  for v_level in
    select * from jsonb_to_recordset(p_levels) as x(
      code text, min_percent numeric, max_percent numeric, points integer,
      name text, description text, broad text, sort_order integer, color text
    )
  loop
    v_code := nullif(btrim(coalesce(v_level.code, '')), '');
    v_min := v_level.min_percent;
    v_max := v_level.max_percent;
    v_points := v_level.points;
    v_name := nullif(btrim(coalesce(v_level.name, '')), '');
    v_desc := coalesce(v_level.description, '');
    v_broad := nullif(btrim(coalesce(v_level.broad, '')), '');
    v_ord := v_level.sort_order;
    v_color := nullif(btrim(coalesce(v_level.color, '')), '');

    if v_code is null then
      raise exception 'level code is required';
    end if;
    if v_min is null or v_max is null then
      raise exception 'level % must have min_percent and max_percent', v_code;
    end if;
    if v_min < 0 or v_min > 100 or v_max < 0 or v_max > 100 or v_min > v_max then
      raise exception 'invalid range for level %', v_code;
    end if;
    if v_name is null then
      raise exception 'level % must have a name', v_code;
    end if;
    if v_ord is null or v_ord < 0 then
      raise exception 'level % must have a non-negative sort_order', v_code;
    end if;
    if v_color is null then
      raise exception 'level % must have a color', v_code;
    end if;

    if v_code = any(v_seen_codes) then
      raise exception 'duplicate grading level code: %', v_code;
    end if;
    if v_ord = any(v_seen_orders) then
      raise exception 'duplicate grading level sort_order: %', v_ord;
    end if;
    v_seen_codes := array_append(v_seen_codes, v_code);
    v_seen_orders := array_append(v_seen_orders, v_ord);

    if p_mode = '8' then
      if v_points is null or v_points < 1 or v_points > 8 then
        raise exception '8-level grading requires points from 1 to 8 for level %', v_code;
      end if;
      if v_broad is null or v_broad not in ('EE', 'ME', 'AE', 'BE') then
        raise exception '8-level grading requires broad category EE, ME, AE, or BE for level %', v_code;
      end if;
      if v_code not in ('EE1','EE2','ME1','ME2','AE1','AE2','BE1','BE2') then
        raise exception 'invalid 8-level grading code: %', v_code;
      end if;
    else
      if v_points is not null then
        raise exception '4-level grading does not use points; level % must have NULL points', v_code;
      end if;
      if v_broad is null or v_broad not in ('EE', 'ME', 'AE', 'BE') then
        raise exception '4-level grading requires broad category EE, ME, AE, or BE for level %', v_code;
      end if;
      if v_code not in ('EE','ME','AE','BE') then
        raise exception 'invalid 4-level grading code: %', v_code;
      end if;
    end if;
  end loop;

  -- Sort by the actual lower boundary, not by client-provided order.
  -- The achievement engine uses min_percent as the authoritative boundary,
  -- so enforce complete coverage with no overlapping or uncovered interval.
  for v_level in
    select *
    from jsonb_to_recordset(p_levels) as x(
      code text, min_percent numeric, max_percent numeric, points integer,
      name text, description text, broad text, sort_order integer, color text
    )
    order by min_percent asc, sort_order asc
  loop
    v_min := v_level.min_percent;
    v_max := v_level.max_percent;

    if v_previous_min is null then
      if v_min <> 0 then
        raise exception 'grading scale must start at 0 percent';
      end if;
    else
      if v_min <= v_previous_min then
        raise exception 'grading level lower bounds must be strictly increasing';
      end if;
      if v_min <= v_previous_max then
        raise exception 'grading scale has overlapping bands around % percent', v_min;
      end if;
      if v_min > v_previous_max + 0.01 then
        raise exception 'grading scale has a gap between % and % percent', v_previous_max, v_min;
      end if;
    end if;

    v_previous_min := v_min;
    v_previous_max := v_max;
  end loop;

  if v_previous_max <> 100 then
    raise exception 'grading scale must end at 100 percent';
  end if;

  -- The canonical KNEC-style code sets must be complete. This prevents a
  -- configuration with the right row count but missing/repeated semantic bands.
  if p_mode = '8' then
    if not (
      v_seen_codes @> array['EE1','EE2','ME1','ME2','AE1','AE2','BE1','BE2']::text[]
      and array_length(v_seen_codes, 1) = 8
    ) then
      raise exception '8-level grading must contain EE1, EE2, ME1, ME2, AE1, AE2, BE1, and BE2 exactly once';
    end if;
  else
    if not (
      v_seen_codes @> array['EE','ME','AE','BE']::text[]
      and array_length(v_seen_codes, 1) = 4
    ) then
      raise exception '4-level grading must contain EE, ME, AE, and BE exactly once';
    end if;
  end if;

  -- Validate 8-level points as a permutation of 1..8.
  if p_mode = '8' then
    if (
      select count(distinct x.points)
      from jsonb_to_recordset(p_levels) as x(points integer)
    ) <> 8
    or (
      select coalesce(sum(x.points), 0)
      from jsonb_to_recordset(p_levels) as x(points integer)
    ) <> 36 then
      raise exception '8-level grading points must contain each value from 1 to 8 exactly once';
    end if;
  end if;

  -- Only after all validation succeeds do we mutate configuration state.
  update public.grading_configurations
  set active = false
  where tenant_id = v_tenant_id;

  insert into public.grading_configurations (tenant_id, mode, active, legacy_source)
  values (v_tenant_id, p_mode, true, false)
  returning id into v_config_id;

  for v_level in
    select * from jsonb_to_recordset(p_levels) as x(
      code text, min_percent numeric, max_percent numeric, points integer,
      name text, description text, broad text, sort_order integer, color text
    )
  loop
    insert into public.grading_configuration_levels
      (config_id, code, min_percent, max_percent, points, name, description, broad, sort_order, color)
    values (
      v_config_id,
      btrim(v_level.code),
      v_level.min_percent,
      v_level.max_percent,
      v_level.points,
      btrim(v_level.name),
      coalesce(v_level.description, ''),
      nullif(btrim(coalesce(v_level.broad, '')), ''),
      v_level.sort_order,
      btrim(v_level.color)
    );
  end loop;

  return v_config_id;
end;
$$;

-- SECURITY DEFINER functions must not remain executable by PUBLIC. The RPC
-- is intentionally callable only by authenticated clients, while the
-- function itself performs the authoritative admin/tenant authorization.
revoke all on function public.upsert_grading_configuration(text, jsonb) from public;
revoke all on function public.upsert_grading_configuration(text, jsonb) from anon;
grant execute on function public.upsert_grading_configuration(text, jsonb) to authenticated;
