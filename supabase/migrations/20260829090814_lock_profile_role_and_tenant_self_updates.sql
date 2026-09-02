create or replace function public.prevent_profile_scope_change()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is not null and (old.role is distinct from new.role or old.tenant_id is distinct from new.tenant_id) then
    raise exception 'Profile role and tenant scope cannot be changed by the user';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_scope on public.profiles;
create trigger protect_profile_scope before update on public.profiles for each row execute function public.prevent_profile_scope_change();
