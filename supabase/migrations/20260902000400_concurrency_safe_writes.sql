-- Concurrency-safe writes for multi-device operation.
--
-- These functions make score and configuration writes atomic (single SQL
-- transactions) and re-enforce tenant isolation inside the database even
-- though they are SECURITY DEFINER:
--   * save_marks_grid            -- optimistic-concurrency score save
--   * set_exam_scope             -- atomic exam scope replacement
--   * save_grading_levels        -- atomic grading-level replacement
--   * save_report_configuration  -- atomic report config + remarks save
--
-- The database is the final authority for data integrity. Every function:
--   * derives the tenant from auth.uid() via public.my_tenant_id(),
--   * re-validates exam/subject/learner/template ownership (defense in depth
--     on top of RLS),
--   * applies per-row optimistic concurrency using updated_at snapshots for
--     scores, so a concurrent same-record edit is reported, never silently
--     overwritten, and unrelated rows are never touched.
--
-- Until this migration is applied the application falls back to the previous
-- per-statement writes.

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
  -- authoritative scope gate (shared with the Assignment page).
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'exam_class_subjects'
  ) then
    if not exists (
      select 1 from public.exam_class_subjects ecs
      where ecs.exam_id = p_exam_id and ecs.class_id = p_class_id and ecs.subject_id = p_subject_id
    ) then
      raise exception 'grade and learning area are not assigned to this assessment';
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

create or replace function public.set_exam_scope(
  p_exam_id uuid,
  p_class_ids uuid[],
  p_subject_rows jsonb
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
    select 1 from public.exams e where e.id = p_exam_id and e.tenant_id = v_tenant_id
  ) then
    raise exception 'examination does not belong to this school';
  end if;
  if p_class_ids is not null and array_length(p_class_ids, 1) > 0 then
    if exists (
      select 1 from unnest(p_class_ids) as cid
      where not exists (
        select 1 from public.classes c where c.id = cid and c.tenant_id = v_tenant_id
      )
    ) then
      raise exception 'unauthorized class';
    end if;
  end if;
  if p_subject_rows is not null and jsonb_array_length(p_subject_rows) > 0 then
    if exists (
      select 1 from jsonb_to_recordset(p_subject_rows) as x(class_id uuid, subject_id uuid)
      where not exists (
        select 1 from public.classes c where c.id = x.class_id and c.tenant_id = v_tenant_id
      ) or not exists (
        select 1 from public.subjects s where s.id = x.subject_id and s.tenant_id = v_tenant_id
      )
    ) then
      raise exception 'unauthorized grade or learning area';
    end if;
  end if;

  delete from public.exam_classes where exam_id = p_exam_id;
  if p_class_ids is not null and array_length(p_class_ids, 1) > 0 then
    insert into public.exam_classes (exam_id, class_id)
    select p_exam_id, cid from unnest(p_class_ids) as t(cid);
  end if;

  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'exam_class_subjects'
  ) then
    delete from public.exam_class_subjects where exam_id = p_exam_id;
    if p_subject_rows is not null and jsonb_array_length(p_subject_rows) > 0 then
      insert into public.exam_class_subjects (exam_id, class_id, subject_id)
      select p_exam_id, x.class_id, x.subject_id
      from jsonb_to_recordset(p_subject_rows) as x(class_id uuid, subject_id uuid);
    end if;
  end if;
end;
$$;

revoke all on function public.set_exam_scope(uuid, uuid[], jsonb) from public;
grant execute on function public.set_exam_scope(uuid, uuid[], jsonb) to authenticated;

create or replace function public.save_grading_levels(
  p_template_id uuid,
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
  if p_rows is null or jsonb_array_length(p_rows) < 4 or jsonb_array_length(p_rows) > 8 then
    raise exception 'configure 4 to 8 grading levels';
  end if;

  delete from public.report_grading_levels where report_template_id = p_template_id;
  insert into public.report_grading_levels
    (tenant_id, report_template_id, level_code, min_score, max_score, description, sort_order)
  select
    v_tenant_id, p_template_id,
    (r.level_code)::text, (r.min_score)::numeric, (r.max_score)::numeric,
    (r.description)::text, (r.sort_order)::int
  from jsonb_to_recordset(p_rows) as r(
    level_code text, min_score numeric, max_score numeric, description text, sort_order int
  );
end;
$$;

revoke all on function public.save_grading_levels(uuid, jsonb) from public;
grant execute on function public.save_grading_levels(uuid, jsonb) to authenticated;

create or replace function public.save_report_configuration(
  p_opening_date date,
  p_closing_date date,
  p_teacher_enabled boolean,
  p_principal_enabled boolean,
  p_assessment_components jsonb,
  p_teacher_remarks text[],
  p_principal_remarks text[],
  p_template_name text default 'Default Report Form'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.my_tenant_id();
  v_template_id uuid;
begin
  select id into v_template_id
  from public.report_templates
  where tenant_id = v_tenant_id and is_default = true
  limit 1;

  if v_template_id is null then
    insert into public.report_templates (tenant_id, name, template_json, is_default)
    values (
      v_tenant_id,
      p_template_name,
      jsonb_build_object('assessmentComponents', p_assessment_components),
      true
    )
    returning id into v_template_id;
  else
    -- Merge so other template fields (visibility toggles) are preserved.
    update public.report_templates
    set template_json = jsonb_set(
      coalesce(template_json, '{}'::jsonb),
      '{assessmentComponents}',
      p_assessment_components
    )
    where id = v_template_id;
  end if;

  insert into public.report_template_configs
    (tenant_id, report_template_id, opening_date, closing_date,
     teacher_remarks_enabled, principal_remarks_enabled)
  values
    (v_tenant_id, v_template_id, p_opening_date, p_closing_date,
     p_teacher_enabled, p_principal_enabled)
  on conflict (report_template_id) do update
  set opening_date = excluded.opening_date,
      closing_date = excluded.closing_date,
      teacher_remarks_enabled = excluded.teacher_remarks_enabled,
      principal_remarks_enabled = excluded.principal_remarks_enabled,
      updated_at = now();

  delete from public.report_teacher_remarks where report_template_id = v_template_id;
  if p_teacher_remarks is not null then
    insert into public.report_teacher_remarks (tenant_id, report_template_id, remark, sort_order)
    select v_tenant_id, v_template_id, r.remark, (r.sort_order)::int
    from unnest(p_teacher_remarks) with ordinality as r(remark, sort_order);
  end if;

  delete from public.report_principal_remarks where report_template_id = v_template_id;
  if p_principal_remarks is not null then
    insert into public.report_principal_remarks (tenant_id, report_template_id, remark, sort_order)
    select v_tenant_id, v_template_id, r.remark, (r.sort_order)::int
    from unnest(p_principal_remarks) with ordinality as r(remark, sort_order);
  end if;
end;
$$;

revoke all on function public.save_report_configuration(date, date, boolean, boolean, jsonb, text[], text[], text) from public;
grant execute on function public.save_report_configuration(date, date, boolean, boolean, jsonb, text[], text[], text) to authenticated;