-- Port term dates schools already entered on `report_template_configs` into
-- the new per-tenant `terms` calendar so existing reports keep their dates.
--
-- Term label/academic year are derived from the school's latest examination
-- (the term teachers entered dates against on the settings screen). Only
-- single-term-sane pairs are carried over (opening before closing); the
-- opening-closing pairs that actually described "this term closes / next term
-- opens" cannot be inferred reliably and are left for the school to re-enter
-- (their reports show "To be announced" until then).

insert into public.terms (tenant_id, academic_year, term_label, opening_date, closing_date)
select
  c.tenant_id,
  e.academic_year,
  'Term ' || e.n,
  c.opening_date,
  c.closing_date
from public.report_template_configs c
cross join lateral (
  select e.term, e.academic_year, (regexp_match(e.term, '([1-4])\D*$'))[1] as n
  from public.exams e
  where e.tenant_id = c.tenant_id
  order by e.academic_year desc, e.created_at desc
  limit 1
) e
where (c.opening_date is not null or c.closing_date is not null)
  and e.n is not null
  and (c.opening_date is null or c.closing_date is null or c.opening_date < c.closing_date)
on conflict (tenant_id, academic_year, term_label) do update
  set opening_date = coalesce(excluded.opening_date, public.terms.opening_date),
      closing_date = coalesce(excluded.closing_date, public.terms.closing_date),
      updated_at = now();