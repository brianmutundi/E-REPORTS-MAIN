-- Add a selectable report-form key to the school's default report template so a
-- second form ("CBC 4-Level Assessment Report") can be chosen alongside the
-- standard Assessment Report. Defaults to 'standard' so existing rows are
-- unaffected until an administrator explicitly switches forms.
alter table public.report_templates add column if not exists template_key text not null default 'standard';

alter table public.report_templates drop constraint if exists report_templates_template_key_check;
alter table public.report_templates add constraint report_templates_template_key_check check (template_key in ('standard', 'cbc_4level'));