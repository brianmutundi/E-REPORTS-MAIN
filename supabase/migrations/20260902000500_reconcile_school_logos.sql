-- Reconcile remote storage state with the official school-logo design.
--
-- A duplicate lineage of the school-logo work (version 20260831102653) was
-- pushed to the remote from another branch and is being marked reverted in
-- the migration history. Its side effects remain in the database though, and
-- they diverge from the official 20260901000200 design in two ways that the
-- app depends on:
--
--   * bucket `school-logos` was created with `public = false`, but the
--     official design intends a public bucket (logo-uploader resolves URLs
--     with `getPublicUrl`, which requires a public bucket), and
--   * it left differently-named RLS policies (school_logos_select/insert/
--     update/delete) that duplicate the authoritative policy set installed by
--     20260901000200 (upload_own/read_public/update_own/delete_own).
--
-- This migration makes the remote match the intended schema. It is idempotent.
update storage.buckets
set public = true
where id = 'school-logos';

drop policy if exists "school_logos_select" on storage.objects;
drop policy if exists "school_logos_insert" on storage.objects;
drop policy if exists "school_logos_update" on storage.objects;
drop policy if exists "school_logos_delete" on storage.objects;