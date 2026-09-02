-- School logo storage + tenant updates.
--
-- Creates a public storage bucket for school logos and policies that let an
-- authenticated admin of a tenant upload/delete files only inside their own
-- tenant folder, while anyone can read them (they are embedded in reports).
--
-- Also adds the missing UPDATE policy on `tenants` so admins can persist
-- school profile changes (name, code, address, logo_url) via the normal
-- authenticated server client instead of relying only on a service role.

-- ---- Storage bucket ------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('school-logos', 'school-logos', true)
on conflict (id) do nothing;

-- Upload into your own tenant folder only.
drop policy if exists "school_logos_upload_own" on storage.objects;
create policy "school_logos_upload_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = public.my_tenant_id()::text
  );

-- Read any school logo (public bucket).
drop policy if exists "school_logos_read_public" on storage.objects;
create policy "school_logos_read_public"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'school-logos');

-- Update/delete only your own tenant folder.
drop policy if exists "school_logos_update_own" on storage.objects;
create policy "school_logos_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = public.my_tenant_id()::text
  );

drop policy if exists "school_logos_delete_own" on storage.objects;
create policy "school_logos_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = public.my_tenant_id()::text
  );

-- ---- Tenants UPDATE policy ----------------------------------------------
-- Allow an authenticated admin to update their own school profile.
drop policy if exists tenant_update_self on public.tenants;
create policy tenant_update_self
  on public.tenants for update to authenticated
  using (id = public.my_tenant_id())
  with check (id = public.my_tenant_id());
