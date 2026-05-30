-- ============================================================
-- Loopnest Central Database
-- Migration 006 — folio portfolio groups
--
-- Adds a portfolio_groups table so users can bundle related
-- portfolios (e.g. "Moomoo AUD" + "Moomoo US") into a named
-- group for consolidated performance and tax reporting.
-- ============================================================

-- ── portfolio_groups ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS folio.portfolio_groups (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES folio.profiles(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portfolio_groups_user_id_idx ON folio.portfolio_groups(user_id);

DROP TRIGGER IF EXISTS set_portfolio_groups_updated_at ON folio.portfolio_groups;
CREATE TRIGGER set_portfolio_groups_updated_at
  BEFORE UPDATE ON folio.portfolio_groups
  FOR EACH ROW EXECUTE FUNCTION folio.set_updated_at();

-- ── FK on portfolios ─────────────────────────────────────────
-- ON DELETE SET NULL: deleting a group un-groups its portfolios
-- but does not delete the portfolios themselves.
ALTER TABLE folio.portfolios
  ADD COLUMN IF NOT EXISTS group_id UUID
    REFERENCES folio.portfolio_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS portfolios_group_id_idx ON folio.portfolios(group_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE folio.portfolio_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS folio_groups_select ON folio.portfolio_groups;
CREATE POLICY folio_groups_select ON folio.portfolio_groups
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS folio_groups_insert ON folio.portfolio_groups;
CREATE POLICY folio_groups_insert ON folio.portfolio_groups
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS folio_groups_update ON folio.portfolio_groups;
CREATE POLICY folio_groups_update ON folio.portfolio_groups
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS folio_groups_delete ON folio.portfolio_groups;
CREATE POLICY folio_groups_delete ON folio.portfolio_groups
  FOR DELETE USING (user_id = auth.uid());

-- Grant to authenticated role
GRANT ALL ON folio.portfolio_groups TO authenticated;
