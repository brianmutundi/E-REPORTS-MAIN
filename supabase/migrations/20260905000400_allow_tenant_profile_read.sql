-- Allow authenticated users to read their own school's profile.
-- Assessment reports require the tenant row for the school name, logo and address.
-- Keep tenant isolation strict: a user can only read the tenant returned by my_tenant_id().

drop policy if exists tenant_select_self on public.tenants;
create policy tenant_select_self
  on public.tenants
  for select
  to authenticated
  using (id = public.my_tenant_id());
