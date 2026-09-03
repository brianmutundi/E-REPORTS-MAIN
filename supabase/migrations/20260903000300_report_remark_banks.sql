-- Report remark banks at the GRADING-SYSTEM level (not the report level).
--
-- Class Teacher and Principal/Head Teacher remarks are plain NARRATIVE sentence
-- templates determined by a learner's overall performance band. They are NOT
-- scored and are NOT labelled with the EE/ME/AE/BE performance scale — they use
-- plain band labels (Excellent, Very good, Good, Improving, Needs support).
--
-- They are edited centrally in the grading system configuration and rendered as
-- fixed read-only text on every report; there is no per-learner or per-report
-- overriding, and no "include remarks" toggle (remarks are always present).

create table if not exists public.report_remark_banks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null check (role in ('class_teacher', 'principal')),
  band text not null check (band in ('excellent', 'very_good', 'good', 'improving', 'needs_support')),
  text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, role, band)
);

alter table public.report_remark_banks enable row level security;

create policy report_remark_banks_tenant on public.report_remark_banks
  for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());

create index if not exists report_remark_banks_tenant_role_sort_idx
  on public.report_remark_banks(tenant_id, role, sort_order);

-- Seed the bank when a report template is created (the template is the natural
-- per-school object that already exists for every tenant).
create or replace function public.seed_report_remark_banks(p_template_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.report_templates where id = p_template_id;
  if v_tenant is null then
    raise exception 'report template % does not exist', p_template_id;
  end if;

  insert into public.report_remark_banks (tenant_id, role, band, text, sort_order)
  values
    (v_tenant, 'class_teacher', 'excellent',   'Excellent progress this term. You have demonstrated strong understanding of the learning areas and consistently participated well in learning activities. Keep up the good work.', 0),
    (v_tenant, 'class_teacher', 'very_good',   'Very good progress. You are developing your competencies well and showing a positive attitude towards learning. Continue working consistently.', 1),
    (v_tenant, 'class_teacher', 'good',        'Good progress this term. You have demonstrated steady improvement and satisfactory participation. Put more effort into areas that require improvement.', 2),
    (v_tenant, 'class_teacher', 'improving',   'You have shown encouraging improvement this term. Continue practising regularly and participate actively in learning activities to strengthen your competencies.', 3),
    (v_tenant, 'class_teacher', 'needs_support','You are making progress but require more practice and support in some learning areas. Remain focused and seek assistance whenever you experience difficulties.', 4),
    (v_tenant, 'principal', 'excellent',       'Excellent performance and progress. Maintain the same commitment and continue developing your competencies.', 0),
    (v_tenant, 'principal', 'very_good',       'Very good progress. Keep up the positive attitude towards learning and strive for continuous improvement.', 1),
    (v_tenant, 'principal', 'good',            'Good progress. Continue working consistently and make greater effort in areas requiring improvement.', 2),
    (v_tenant, 'principal', 'improving',       'Encouraging progress. With continued effort, practice and support, greater achievement can be realised.', 3),
    (v_tenant, 'principal', 'needs_support',   'More effort and consistent practice are required. The learner is encouraged to remain focused and make use of available support.', 4)
  on conflict (tenant_id, role, band) do nothing;
end;
$$;
revoke all on function public.seed_report_remark_banks(uuid) from public;
grant execute on function public.seed_report_remark_banks(uuid) to authenticated;

-- Atomic upsert of a whole remark bank for one role (5 plain bands).
create or replace function public.save_report_remark_bank(p_tenant_id uuid, p_role text, p_banks jsonb)
returns void language plpgsql security definer set search_path=public
as $$
declare
  rec record;
begin
  for rec in select * from jsonb_to_recordset(p_banks) as x(band text, text text, sort_order int)
  loop
    insert into public.report_remark_banks (tenant_id, role, band, text, sort_order)
    values (p_tenant_id, p_role, rec.band, rec.text, rec.sort_order)
    on conflict (tenant_id, role, band)
    do update set text = excluded.text, sort_order = excluded.sort_order, updated_at = now();
  end loop;
end;
$$;
revoke all on function public.save_report_remark_bank(uuid, text, jsonb) from public;
grant execute on function public.save_report_remark_bank(uuid, text, jsonb) to authenticated;
