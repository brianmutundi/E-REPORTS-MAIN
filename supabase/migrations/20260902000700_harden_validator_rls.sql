-- Hardening: the SECURITY DEFINER function validate_report_template_configuration
-- previously accepted any p_template_id without verifying that the template
-- belongs to the caller's tenant. Although it is read-only (it only counts rows
-- and raises exceptions), running with definer rights let an authenticated user
-- probe whether another tenant's template UUID existed and whether its
-- configuration was "valid" — a small cross-tenant information oracle.
--
-- This revision resolves the template through report_templates filtered by the
-- caller's tenant (public.my_tenant_id()) and raises the same 'not found'
-- exception seen after deleting a report template, so a foreign template id can
-- never be validated. Existing behaviour for the caller's own templates is
-- unchanged.

create or replace function public.validate_report_template_configuration(p_template_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare
  v_tenant_id uuid := public.my_tenant_id();
  grading_count integer;
  teacher_count integer;
  principal_count integer;
  overlap_count integer;
begin
  if not exists (
    select 1 from public.report_templates t
    where t.id = p_template_id and t.tenant_id = v_tenant_id
  ) then
    raise exception 'not found';
  end if;

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
