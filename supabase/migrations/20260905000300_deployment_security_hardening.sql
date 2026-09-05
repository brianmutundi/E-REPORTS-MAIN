-- Production security hardening from the pre-deployment review.
revoke execute on function public.count_students_by_class() from anon;
revoke execute on function public.count_students_by_stream() from anon;
revoke execute on function public.is_super_admin() from anon;
revoke execute on function public.my_tenant_id() from anon;
revoke execute on function public.rollover_academic_year(integer, integer) from anon;
revoke execute on function public.save_grading_levels(uuid, jsonb) from anon;
revoke execute on function public.save_marks_grid(uuid, uuid, uuid, uuid[], numeric[], text[]) from anon;
revoke execute on function public.save_report_configuration(date, date, boolean, boolean, jsonb, text[], text[], text) from anon;
revoke execute on function public.save_total_grading_levels(uuid, numeric, jsonb) from anon;
revoke execute on function public.set_exam_scope(uuid, uuid[], jsonb) from anon;
revoke execute on function public.validate_report_template_configuration(uuid) from anon;
revoke execute on function public.knec_default_levels(text) from anon;
revoke execute on function public.prevent_profile_scope_change() from public;
revoke execute on function public.touch_grading_configuration() from public;
alter function public.knec_default_levels(text) set search_path = public;
do $$
begin
  if to_regprocedure('public.save_report_remark_bank(uuid,text,jsonb)') is not null then
    execute 'revoke execute on function public.save_report_remark_bank(uuid,text,jsonb) from anon';
  end if;
  if to_regprocedure('public.seed_report_remark_banks(uuid)') is not null then
    execute 'revoke execute on function public.seed_report_remark_banks(uuid) from anon';
  end if;
end
$$;
drop policy if exists profiles_read_self_or_super on public.profiles;
create policy profiles_read_self_or_super on public.profiles for select to authenticated using ((id = (select auth.uid())) or (select public.is_super_admin()));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()) and ((role = 'admin' and tenant_id is not null) or (role = 'super_admin' and tenant_id is null)));
drop policy if exists tenant_self_or_super on public.tenants;
create policy tenant_self_or_super on public.tenants for select to authenticated using ((id = (select public.my_tenant_id())) or (select public.is_super_admin()));
drop policy if exists tenant_self_update on public.tenants;
drop policy if exists tenant_update_self on public.tenants;
create policy tenant_update_self on public.tenants for update to authenticated using (id = (select public.my_tenant_id())) with check (id = (select public.my_tenant_id()));
