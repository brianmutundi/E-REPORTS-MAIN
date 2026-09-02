alter table public.profiles alter column tenant_id drop not null;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('super_admin','admin'));
alter table public.profiles drop constraint if exists profiles_tenant_role_check;
alter table public.profiles add constraint profiles_tenant_role_check check ((role='super_admin' and tenant_id is null) or (role='admin' and tenant_id is not null));

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path=public
as $$ select exists (select 1 from public.profiles where id=auth.uid() and role='super_admin') $$;
revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

drop policy if exists profiles_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_read_self_or_super on public.profiles for select to authenticated using (id=auth.uid() or public.is_super_admin());
create policy profiles_update_self on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid() and ((role='admin' and tenant_id is not null) or (role='super_admin' and tenant_id is null)));

drop policy if exists tenant_self on public.tenants;
create policy tenant_self_or_super on public.tenants for select to authenticated using (id=public.my_tenant_id() or public.is_super_admin());
