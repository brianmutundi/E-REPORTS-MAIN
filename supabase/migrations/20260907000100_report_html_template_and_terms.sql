-- Selectable custom HTML report form + term calendar.
--
-- 1. report_templates.template_html — the raw HTML (Handlebars `{{...}}`)
--    source for the "html_custom" report selection (e.g. the CBC gemini-code
--    template). Rendered to PDF by the Puppeteer engine in the reports route.
-- 2. public.terms — the per-tenant term calendar. Reports show the CURRENT
--    term's closing date and the NEXT term's opening date; the next-term
--    opening is always after the closing date, or "To be announced".
-- 3. A fail-closed integrity guard for Issue 3: every report-settings table
--    must already carry a permissive tenant RLS policy, or the migration
--    aborts instead of silently shipping a global-settings leak.

alter table public.report_templates
  add column if not exists template_html text;

create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  academic_year integer not null,
  term_label text not null,
  opening_date date,
  closing_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, academic_year, term_label),
  constraint terms_year_check check (academic_year between 2000 and 2100),
  constraint terms_open_before_close check (opening_date is null or closing_date is null or opening_date < closing_date)
);

create index if not exists terms_tenant_year_label_idx
  on public.terms (tenant_id, academic_year, term_label);

alter table public.terms enable row level security;

drop policy if exists terms_tenant on public.terms;
create policy terms_tenant on public.terms
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

-- Issue 3 integrity guard: report settings must stay tenant-isolated. Verify
-- every settings table has a permissive tenant RLS policy before this project
-- is considered healthy. Fail-closed (raise) when any table lacks one.
do $$
declare
  v_table text;
  v_missing text[] := '{}';
begin
  foreach v_table in array array[
    'report_templates',
    'report_template_configs',
    'report_grading_levels',
    'report_teacher_remarks',
    'report_principal_remarks',
    'report_total_grading_levels',
    'grading_configurations',
    'grading_configuration_levels',
    'report_staff',
    'streams',
    'terms'
  ] loop
    if to_regclass(('public.' || v_table)::text) is not null
       and not exists (
         select 1
         from pg_policies p
         where p.schemaname = 'public'
           and p.tablename = v_table
           and p.permissive = 'PERMISSIVE'
       ) then
      v_missing := array_append(v_missing, v_table);
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    raise exception 'e-reports integrity: % missing a permissive tenant RLS policy', array_to_string(v_missing, ', ');
  end if;
  raise notice 'e-reports integrity: all report-settings tables carry tenant RLS policies';
end $$;