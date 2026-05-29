-- ============================================================
-- Loopnest Central Database
-- Migration 004 — signal schema (signal-dashboard)
--
-- Tables: user_profiles, watchlists
--
-- signal-dashboard is frontend-only (no Express backend).
-- All Supabase access uses the anon key from the browser.
-- Therefore:
--   • No backend service-role-only patterns here.
--   • Authenticated users INSERT their own user_profiles row
--     on first sign-in (handled in useAuth.ts — see code change
--     doc in supabase-central/README.md).
--   • First-user-is-admin logic lives in the frontend,
--     independent of folio.profiles and moat.users counts.
--   • No auth.users INSERT trigger — avoids cross-app profile
--     creation for moat-finder and folio-app users.
-- ============================================================

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION (signal-scoped)
-- ============================================================
CREATE OR REPLACE FUNCTION signal.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- USER_PROFILES
-- Different shape from folio.profiles and moat.users:
--   • is_admin BOOLEAN (not a role text field)
--   • status is only 'pending' | 'approved' (no 'rejected')
--   • requested_at tracks when they asked for access
--   • approved_at tracks when admin approved them
-- ============================================================
CREATE TABLE signal.user_profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  display_name TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved')),
  is_admin     BOOLEAN NOT NULL DEFAULT false,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at  TIMESTAMPTZ
);

CREATE INDEX idx_signal_user_profiles_status ON signal.user_profiles(status);

-- ============================================================
-- WATCHLISTS
-- tickers is a PostgreSQL TEXT[] array — one row per named
-- watchlist group per user. The frontend sorts and deduplicates.
-- ============================================================
CREATE TABLE signal.watchlists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  tickers    TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX idx_signal_watchlists_user_id ON signal.watchlists(user_id);

CREATE TRIGGER set_signal_watchlists_updated_at
  BEFORE UPDATE ON signal.watchlists
  FOR EACH ROW EXECUTE FUNCTION signal.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE signal.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal.watchlists    ENABLE ROW LEVEL SECURITY;

-- ── user_profiles ─────────────────────────────────────────────

-- Authenticated users can INSERT their own row on first sign-in.
-- WITH CHECK (auth.uid() = id) prevents inserting on behalf of others.
CREATE POLICY "signal_profiles_insert_own"
  ON signal.user_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users read their own row
CREATE POLICY "signal_profiles_select_own"
  ON signal.user_profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Admins read all rows (needed for the pending-users list in AdminPanel)
CREATE POLICY "signal_profiles_admin_select"
  ON signal.user_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM signal.user_profiles u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
  );

-- Admins can update any row (to approve users)
CREATE POLICY "signal_profiles_admin_update"
  ON signal.user_profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM signal.user_profiles u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM signal.user_profiles u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
  );

-- Service role full access (used for any server-side operations or migrations)
CREATE POLICY "signal_profiles_service_all"
  ON signal.user_profiles FOR ALL
  USING (auth.role() = 'service_role');

-- ── watchlists ────────────────────────────────────────────────

-- Users CRUD their own watchlists only
CREATE POLICY "signal_watchlists_own"
  ON signal.watchlists FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- GRANTS
-- signal-dashboard uses frontend anon key — anon role needs
-- no direct table access (all queries are authenticated).
-- authenticated role needs full CRUD.
-- ============================================================
GRANT ALL ON ALL TABLES    IN SCHEMA signal TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA signal TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON signal.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON signal.watchlists    TO authenticated;
