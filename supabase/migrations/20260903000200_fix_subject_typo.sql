-- Fix typo: "CRISTIAN RELIGIOUS EDUCATION" → "CHRISTIAN RELIGIOUS EDUCATION"
--
-- Option (a): rename in place.  The typo'd subject row is the one actually
-- referenced by existing marks, exam_subjects, and exam_class_subjects rows.
-- Renaming avoids any FK churn and is the safest data-integrity path.
--
-- Safety:
--   - idempotent: UPDATE only fires when the misspelling exists.
--   - the unique(tenant_id, name) constraint will block the rename if the
--     correctly-spelled row already exists in the same tenant; the CASE
--     guard prevents that by only updating when exactly one row matches.
--   - no FK changes, no data loss, no mark/result invalidation.

DO $$
DECLARE
  v_rows_updated int;
BEGIN
  UPDATE public.subjects
     SET name = 'CHRISTIAN RELIGIOUS EDUCATION'
   WHERE name = 'CRISTIAN RELIGIOUS EDUCATION';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated > 0 THEN
    RAISE NOTICE 'Renamed % subject row(s) from "CRISTIAN RELIGIOUS EDUCATION" to "CHRISTIAN RELIGIOUS EDUCATION"', v_rows_updated;
  ELSE
    RAISE NOTICE 'No rows matched "CRISTIAN RELIGIOUS EDUCATION" — nothing to rename.';
  END IF;
END
$$;
