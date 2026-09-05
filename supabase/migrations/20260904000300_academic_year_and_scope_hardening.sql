-- Academic-year bounds, marks grade-scope enforcement, and RPC grant hygiene.
--
-- Follow-up hardening identified during the final reconciliation audit:
--   1. exams.academic_year had no range CHECK (absurd years could corrupt term
--      ordering and the academic-year rollover).
--   2. save_marks_grid and the marks RLS policy verified tenant ownership only,
--      not that each learner is enrolled in the grade the scores belong to.
--   3. get_active_grading_configuration() (SECURITY DEFINER) was still
--      executable by anon/public, unlike every other definer RPC.
-- All statements are additive or idempotent re-definitions. No existing rows
-- are rewritten.

-- 1) exams.academic_year range check (idempotent) ----------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exams_academic_year_range_check'
  ) then
    alter table public.exams
      add constraint exams_academic_year_range_check
      check (academic_year is null or (academic_year between 2000 and 2100));
  end if;
end $$;

-- 2) save_marks_grid: learner must be enrolled in the grade of the scores ---
create or replace function public.save_marks_grid(
  p_exam_id uuid,
  p_subject_id uuid,
  p_class_id uuid,
  p_student_ids uuid[],
  p_scores numeric[],
  p_base_updated_ats text[]
)
returns table (student_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.my_tenant_id();
  v_rowcount integer;
  v_i integer;
  v_name text;
  v_current timestamptz;
begin
  if p_student_ids is null or array_length(p_student_ids, 1) = 0 then
    return;
  end if;

  -- Defense in depth on top of RLS: exam, learning area and every learner must
  -- belong to the caller's school before anything is written.
  if not exists (
    select 1 from public.exams e where e.id = p_exam_id and e.tenant_id = v_tenant_id
  ) then
    raise exception 'examination does not belong to this school';
  end if;
  if not exists (
    select 1 from public.subjects s where s.id = p_subject_id and s.tenant_id = v_tenant_id
  ) then
    raise exception 'learning area does not belong to this school';
  end if;
  if exists (
    select 1 from unnest(p_student_ids) as sid
    where not exists (
      select 1 from public.students s where s.id = sid and s.tenant_id = v_tenant_id
    )
  ) then
    raise exception 'unauthorized learner';
  end if;
  -- When the per-grade scope table exists, the exam/class/subject link is the
  -- authoritative scope gate (shared with the Assignment page), and each
  -- learner must be enrolled in the grade being recorded.
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'exam_class_subjects'
  ) then
    if not exists (
      select 1 from public.exam_class_subjects ecs
      where ecs.exam_id = p_exam_id and ecs.class_id = p_class_id and ecs.subject_id = p_subject_id
    ) then
      raise exception 'grade and learning area are not assigned to this assessment';
    end if;
    if exists (
      select 1 from unnest(p_student_ids) as sid
      join public.students s on s.id = sid
      where s.class_id is distinct from p_class_id
    ) then
      raise exception 'learner is not enrolled in the selected grade';
    end if;
  end if;

  for v_i in 1..array_length(p_student_ids, 1) loop
    -- Absent at load and still blank: nothing to change.
    if p_base_updated_ats[v_i] is null and p_scores[v_i] is null then
      student_id := p_student_ids[v_i];
      status := 'skipped';
      return next;

    -- Absent at load, score now entered: insert only when a concurrent save
    -- has not already created the row. The database unique constraint
    -- (tenant_id, exam_id, student_id, subject_id) is the final authority;
    -- a lost race is reported as a conflict rather than overwriting.
    --
    -- NOTE: the insert deliberately does NOT use `on conflict (...) do
    -- nothing`: the function returns a table with an OUT column also named
    -- `student_id`, and PostgreSQL cannot resolve the unqualified conflict
    -- target against both the marks column and the OUT variable (error 42702).
    -- A plain insert inside a guarded block is equivalent and race-safe,
    -- because the marks_unique_entry constraint is still the final arbiter.
    elsif p_base_updated_ats[v_i] is null then
      begin
        insert into public.marks (tenant_id, exam_id, student_id, subject_id, score, updated_at)
        values (v_tenant_id, p_exam_id, p_student_ids[v_i], p_subject_id, p_scores[v_i], now());
        status := 'ok';
      exception
        when unique_violation then
          status := 'conflict';
      end;
      student_id := p_student_ids[v_i];
      return next;

    -- Score cleared to blank: delete the mark, but only if it is still the
    -- version the user loaded.
    elsif p_scores[v_i] is null then
      delete from public.marks m
      where m.tenant_id = v_tenant_id
        and m.exam_id = p_exam_id
        and m.student_id = p_student_ids[v_i]
        and m.subject_id = p_subject_id
        and m.updated_at = p_base_updated_ats[v_i]::timestamptz;
      get diagnostics v_rowcount = row_count;
      student_id := p_student_ids[v_i];
      status := case when v_rowcount = 1 then 'ok' else 'conflict' end;
      return next;

    -- Versioned update: applies only when the stored updated_at matches the
    -- loaded snapshot. A concurrent same-record edit that committed first
    -- changes the version, so this write is skipped and reported as a
    -- conflict -- never silently overwritten.
    else
      update public.marks m
      set score = p_scores[v_i], updated_at = now()
      where m.tenant_id = v_tenant_id
        and m.exam_id = p_exam_id
        and m.student_id = p_student_ids[v_i]
        and m.subject_id = p_subject_id
        and m.updated_at = p_base_updated_ats[v_i]::timestamptz;
      get diagnostics v_rowcount = row_count;
      student_id := p_student_ids[v_i];
      status := case when v_rowcount = 1 then 'ok' else 'conflict' end;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.save_marks_grid(uuid, uuid, uuid, uuid[], numeric[], text[]) from public;
grant execute on function public.save_marks_grid(uuid, uuid, uuid, uuid[], numeric[], text[]) to authenticated;

-- 3) marks RLS: tenant ownership PLUS grade-scope membership ------------------
-- The scope check is tolerant of legacy assignments: an examination with no
-- exam_class_subjects rows at all keeps the previous (tenant-only) behaviour,
-- while a scoped examination only accepts learners enrolled in one of its
-- scope classes/subjects.
do $$
begin
  if to_regclass('public.exam_class_subjects') is not null then
    execute 'drop policy if exists marks_tenant on public.marks;';
    execute $marks_policy$
      create policy marks_tenant on public.marks
      for all
      using (
        tenant_id = public.my_tenant_id()
        and exists (select 1 from public.exams e where e.id = exam_id and e.tenant_id = public.my_tenant_id())
        and exists (select 1 from public.students s where s.id = student_id and s.tenant_id = public.my_tenant_id())
        and exists (select 1 from public.subjects s where s.id = subject_id and s.tenant_id = public.my_tenant_id())
        and (
          exists (
            select 1 from public.exam_class_subjects ecs
            join public.students s on s.class_id = ecs.class_id
            where ecs.exam_id = exam_id
              and ecs.subject_id = subject_id
              and s.id = student_id
          )
          or not exists (
            select 1 from public.exam_class_subjects ecs2
            where ecs2.exam_id = exam_id
          )
        )
      )
      with check (
        tenant_id = public.my_tenant_id()
        and exists (select 1 from public.exams e where e.id = exam_id and e.tenant_id = public.my_tenant_id())
        and exists (select 1 from public.students s where s.id = student_id and s.tenant_id = public.my_tenant_id())
        and exists (select 1 from public.subjects s where s.id = subject_id and s.tenant_id = public.my_tenant_id())
        and (
          exists (
            select 1 from public.exam_class_subjects ecs
            join public.students s on s.class_id = ecs.class_id
            where ecs.exam_id = exam_id
              and ecs.subject_id = subject_id
              and s.id = student_id
          )
          or not exists (
            select 1 from public.exam_class_subjects ecs2
            where ecs2.exam_id = exam_id
          )
        )
      );
    $marks_policy$;
  end if;
end $$;

-- 4) get_active_grading_configuration must not be executable by anon/public --
do $$
begin
  if to_regprocedure('public.get_active_grading_configuration()') is not null then
    execute 'revoke all on function public.get_active_grading_configuration() from public, anon;';
  end if;
end $$;