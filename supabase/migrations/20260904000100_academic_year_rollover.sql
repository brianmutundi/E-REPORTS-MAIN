-- Academic-year learner placement history and automatic Grade 1-9 progression.
-- Existing students, marks, exams and classes are preserved.

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  year integer not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  unique (tenant_id, year),
  constraint academic_years_year_check check (year between 2000 and 2100),
  constraint academic_years_status_check check (status in ('open', 'closed'))
);

create table if not exists public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year integer not null,
  class_id uuid not null references public.classes(id) on delete restrict,
  stream_id uuid references public.streams(id) on delete set null,
  placement_source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (tenant_id, student_id, academic_year),
  constraint student_enrollments_source_check check (placement_source in ('manual', 'automatic_promotion', 'import')),
  constraint student_enrollments_year_check check (academic_year between 2000 and 2100)
);

create index if not exists academic_years_tenant_year_idx
  on public.academic_years (tenant_id, year);
create index if not exists student_enrollments_tenant_year_class_idx
  on public.student_enrollments (tenant_id, academic_year, class_id);
create index if not exists student_enrollments_student_year_idx
  on public.student_enrollments (student_id, academic_year);

alter table public.academic_years enable row level security;
alter table public.student_enrollments enable row level security;

drop policy if exists academic_years_tenant on public.academic_years;
create policy academic_years_tenant on public.academic_years
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

drop policy if exists student_enrollments_tenant on public.student_enrollments;
create policy student_enrollments_tenant on public.student_enrollments
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

-- Returns the current user's tenant only; never accepts a tenant_id from the client.
create or replace function public.rollover_academic_year(
  p_source_year integer,
  p_target_year integer
)
returns table (
  source_year integer,
  target_year integer,
  promoted_count integer,
  terminal_grade_count integer,
  skipped_inactive_count integer,
  already_enrolled_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.my_tenant_id();
  v_promoted integer := 0;
  v_terminal integer := 0;
  v_skipped integer := 0;
  v_existing integer := 0;
  v_row record;
  v_target_class_id uuid;
  v_target_stream_id uuid;
  v_grade_number integer;
  v_source_stream_name text;
begin
  if v_tenant_id is null then
    raise exception 'No school is linked to this account';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and tenant_id = v_tenant_id and role = 'admin'
  ) then
    raise exception 'Only a school administrator can run academic-year rollover';
  end if;

  if p_source_year is null or p_target_year is null or p_target_year <= p_source_year then
    raise exception 'The target academic year must be later than the source academic year';
  end if;

  insert into public.academic_years (tenant_id, year)
  values (v_tenant_id, p_target_year)
  on conflict (tenant_id, year) do nothing;

  -- If this is the first rollover after deployment, snapshot the students'
  -- current placement as the source-year enrollment. This does not alter data.
  insert into public.student_enrollments (
    tenant_id, student_id, academic_year, class_id, stream_id, placement_source
  )
  select s.tenant_id, s.id, p_source_year, s.class_id, s.stream_id, 'manual'
  from public.students s
  where s.tenant_id = v_tenant_id
    and s.class_id is not null
    and not exists (
      select 1 from public.student_enrollments se
      where se.tenant_id = v_tenant_id
        and se.student_id = s.id
        and se.academic_year = p_source_year
    )
  on conflict (tenant_id, student_id, academic_year) do nothing;

  select count(*) into v_existing
  from public.student_enrollments
  where tenant_id = v_tenant_id
    and academic_year = p_target_year;

  for v_row in
    select se.student_id, se.class_id, se.stream_id, c.name as class_name,
           s.admission_no, s.full_name
    from public.student_enrollments se
    join public.students s on s.id = se.student_id and s.tenant_id = v_tenant_id
    join public.classes c on c.id = se.class_id and c.tenant_id = v_tenant_id
    where se.tenant_id = v_tenant_id
      and se.academic_year = p_source_year
      and not exists (
        select 1 from public.student_enrollments existing
        where existing.tenant_id = v_tenant_id
          and existing.student_id = se.student_id
          and existing.academic_year = p_target_year
      )
    order by c.name, s.full_name, s.admission_no
  loop
    -- This schema has no active/inactive student flag. A null class is therefore
    -- the only non-enrolled state, and source enrollments already require a class.
    v_grade_number := null;
    if v_row.class_name ~* '^\\s*(grade\\s*|g\\s*)?[1-9]\\s*$' then
      v_grade_number := substring(v_row.class_name from '([1-9])\\s*$')::integer;
    end if;

    if v_grade_number is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Grade 9 is terminal and remains Grade 9 in the new academic year.
    if v_grade_number < 9 then
      v_grade_number := v_grade_number + 1;
    end if;

    select c.id into v_target_class_id
    from public.classes c
    where c.tenant_id = v_tenant_id
      and (
        c.name ~* ('^\\s*grade\\s*' || v_grade_number || '\\s*$')
        or c.name ~* ('^\\s*g\\s*' || v_grade_number || '\\s*$')
        or c.name ~ ('^\\s*' || v_grade_number || '\\s*$')
      )
    order by
      case when c.name ~* ('^\\s*grade\\s*' || v_grade_number || '\\s*$') then 0 else 1 end,
      c.name
    limit 1;

    if v_target_class_id is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_target_stream_id := null;
    if v_row.stream_id is not null then
      select st.name into v_source_stream_name
      from public.streams st
      where st.id = v_row.stream_id
        and st.tenant_id = v_tenant_id;

      if v_source_stream_name is not null then
        select st.id into v_target_stream_id
        from public.streams st
        where st.tenant_id = v_tenant_id
          and st.class_id = v_target_class_id
          and lower(trim(st.name)) = lower(trim(v_source_stream_name))
        limit 1;
      end if;
    end if;

    insert into public.student_enrollments (
      tenant_id, student_id, academic_year, class_id, stream_id, placement_source
    ) values (
      v_tenant_id, v_row.student_id, p_target_year, v_target_class_id,
      v_target_stream_id, 'automatic_promotion'
    ) on conflict (tenant_id, student_id, academic_year) do nothing;

    update public.students
    set class_id = v_target_class_id,
        stream_id = v_target_stream_id
    where id = v_row.student_id
      and tenant_id = v_tenant_id;

    if v_grade_number = 9 then
      v_terminal := v_terminal + 1;
    else
      v_promoted := v_promoted + 1;
    end if;
  end loop;

  return query
    select p_source_year, p_target_year, v_promoted, v_terminal, v_skipped, v_existing;
end;
$$;

revoke all on function public.rollover_academic_year(integer, integer) from public;
grant execute on function public.rollover_academic_year(integer, integer) to authenticated;
