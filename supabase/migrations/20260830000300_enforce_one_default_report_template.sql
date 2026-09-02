create unique index if not exists report_templates_one_default_per_tenant on public.report_templates (tenant_id) where is_default = true;
