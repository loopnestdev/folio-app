-- ============================================================
-- Loopnest Central Database
-- Migration 005 — Data Migration Helper
--
-- Run this AFTER exporting data from the old Supabase projects
-- and AFTER users have re-authenticated into the new project
-- (which creates their auth.users rows with new UUIDs).
--
-- Usage:
--   1. Complete migrations 001–004 first.
--   2. Have all users sign in once via Google OAuth to generate
--      their new auth.users rows.
--   3. Build the UUID mapping table below from the Supabase
--      Auth admin API (list users from old vs new project).
--   4. Run this script with your actual data.
--
-- Covers: folio-app, moat-finder, signal-dashboard
-- ============================================================

-- ============================================================
-- STEP 1: UUID MAPPING TABLE
-- Maps old project UUIDs → new project UUIDs.
-- Populate this from the Auth admin API before running.
-- ============================================================
CREATE TEMP TABLE uuid_map (
  old_id  UUID NOT NULL,
  new_id  UUID NOT NULL,
  email   TEXT NOT NULL
);

-- INSERT INTO uuid_map VALUES
--   ('old-uuid-here', 'new-uuid-here', 'user@example.com'),
--   ...;

-- ============================================================
-- STEP 2: FOLIO-APP DATA
-- After exporting from the old Supabase project:
--   pg_dump --data-only --schema=public \
--     --table=profiles --table=portfolios --table=securities \
--     --table=trades --table=price_history --table=benchmark_data \
--     "postgresql://..." > folio_export.sql
--
-- Then sed 's/public\./folio./g' folio_export.sql > folio_import.sql
-- and replace old UUIDs using the mapping below.
-- ============================================================

-- Example: remap folio.profiles user IDs after import
-- UPDATE folio.profiles p
-- SET id = m.new_id
-- FROM uuid_map m
-- WHERE p.id = m.old_id;

-- Example: remap folio.portfolios user_id after import
-- UPDATE folio.portfolios p
-- SET user_id = m.new_id
-- FROM uuid_map m
-- WHERE p.user_id = m.old_id;

-- ============================================================
-- STEP 3: MOAT-FINDER DATA
-- After exporting from the old Supabase project:
--   pg_dump --data-only --schema=public \
--     --table=users --table=tickers --table=research_reports \
--     --table=research_versions --table=audit_log \
--     --table=research_checkpoints \
--     "postgresql://..." > moat_export.sql
--
-- Then sed 's/public\./moat./g' moat_export.sql > moat_import.sql
-- ============================================================

-- Example: remap moat.users IDs after import
-- UPDATE moat.users u
-- SET id = m.new_id
-- FROM uuid_map m
-- WHERE u.id = m.old_id;

-- Example: remap moat.research_reports researched_by after import
-- UPDATE moat.research_reports r
-- SET researched_by = m.new_id
-- FROM uuid_map m
-- WHERE r.researched_by = m.old_id;

-- ============================================================
-- STEP 4: SIGNAL-DASHBOARD DATA
-- signal-dashboard's old Supabase project used the "public" schema.
--
-- Export:
--   pg_dump --data-only --schema=public \
--     --table=user_profiles --table=watchlists \
--     "postgresql://..." > signal_export.sql
--
-- Remap schema:
--   sed 's/public\./signal./g' signal_export.sql > signal_import.sql
--
-- Then remap UUIDs (user_profiles.id and watchlists.user_id both
-- reference auth.users):
-- ============================================================

-- Example: remap signal.user_profiles IDs after import
-- UPDATE signal.user_profiles p
-- SET id = m.new_id
-- FROM uuid_map m
-- WHERE p.id = m.old_id;

-- Example: remap signal.watchlists user_id after import
-- UPDATE signal.watchlists w
-- SET user_id = m.new_id
-- FROM uuid_map m
-- WHERE w.user_id = m.old_id;

-- ============================================================
-- STEP 5: VERIFY
-- ============================================================
-- SELECT COUNT(*) FROM folio.profiles;
-- SELECT COUNT(*) FROM folio.portfolios;
-- SELECT COUNT(*) FROM folio.trades;
-- SELECT COUNT(*) FROM moat.users;
-- SELECT COUNT(*) FROM moat.research_reports;
-- SELECT COUNT(*) FROM moat.tickers;
-- SELECT COUNT(*) FROM signal.user_profiles;
-- SELECT COUNT(*) FROM signal.watchlists;

-- DROP TABLE uuid_map;
