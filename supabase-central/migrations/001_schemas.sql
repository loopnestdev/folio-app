-- ============================================================
-- Loopnest Central Database
-- Migration 001 — Schema Bootstrap
--
-- Creates isolated namespaces for each application.
-- Shared: auth schema (managed by Supabase).
--
-- Apps:
--   folio  → folio-app      (Express backend + React frontend)
--   moat   → moat-finder    (Express backend + React frontend)
--   signal → signal-dashboard (frontend-only, anon key in browser)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS folio;   -- folio-app
CREATE SCHEMA IF NOT EXISTS moat;    -- moat-finder
CREATE SCHEMA IF NOT EXISTS signal;  -- signal-dashboard

-- Allow Supabase roles to use all schemas
GRANT USAGE ON SCHEMA folio   TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA moat    TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA signal  TO anon, authenticated, service_role;

-- PostgREST needs default privileges so future tables are accessible.
-- (Specific table grants are set in each schema migration.)
ALTER DEFAULT PRIVILEGES IN SCHEMA folio
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA moat
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA signal
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA folio
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA moat
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA signal
  GRANT ALL ON TABLES TO service_role;

-- ============================================================
-- NOTE: After running this migration, go to:
-- Supabase Dashboard → Project Settings → API → "Exposed schemas"
-- Add "folio", "moat", and "signal" to the list so PostgREST
-- exposes them via the REST API.
-- ============================================================
