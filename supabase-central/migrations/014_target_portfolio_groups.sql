-- ============================================================
-- Loopnest Central Database
-- Migration 014 — target portfolio groups (folio-app)
--
-- Groups bundle one or more target portfolios, each with a weight
-- (% of the group), so a single plan can say e.g. "40% ETF - Buy and
-- Hold, 35% High-Growth AI, 25% Shortlist-US". A target portfolio can
-- belong to several groups with a different weight in each.
--
-- Also stores the investable amount (the capital the plan is sized
-- for, from the start of investing) on both groups and target
-- portfolios; it was previously kept only in the browser.
--
-- Two new tables:
--   folio.target_portfolio_groups         — named groups, investable amount, active flag
--   folio.target_portfolio_group_members  — group <-> target portfolio, with weight_pct
--
-- Idempotent: safe to re-run.
-- ============================================================

-- ── Investable amount on target portfolios ───────────────────
ALTER TABLE folio.target_portfolios
  ADD COLUMN IF NOT EXISTS investable_amount   NUMERIC(14,2) CHECK (investable_amount IS NULL OR investable_amount >= 0),
  ADD COLUMN IF NOT EXISTS investable_currency TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(investable_currency) = 3);

-- ── Groups ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS folio.target_portfolio_groups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description         TEXT,
  investable_amount   NUMERIC(14,2) CHECK (investable_amount IS NULL OR investable_amount >= 0),
  investable_currency TEXT NOT NULL DEFAULT 'AUD' CHECK (char_length(investable_currency) = 3),
  is_active           BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_target_portfolio_groups_updated_at ON folio.target_portfolio_groups;
CREATE TRIGGER set_target_portfolio_groups_updated_at
  BEFORE UPDATE ON folio.target_portfolio_groups
  FOR EACH ROW EXECUTE FUNCTION folio.set_updated_at();

-- ── Members ──────────────────────────────────────────────────
-- Deleting a group removes its memberships; deleting a target portfolio
-- removes it from every group it belonged to.
CREATE TABLE IF NOT EXISTS folio.target_portfolio_group_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            UUID NOT NULL REFERENCES folio.target_portfolio_groups(id) ON DELETE CASCADE,
  target_portfolio_id UUID NOT NULL REFERENCES folio.target_portfolios(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_pct          NUMERIC(6,2) NOT NULL CHECK (weight_pct > 0 AND weight_pct <= 100),
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, target_portfolio_id)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_target_portfolio_groups_user_id
  ON folio.target_portfolio_groups(user_id);

CREATE INDEX IF NOT EXISTS idx_target_portfolio_group_members_group_id
  ON folio.target_portfolio_group_members(group_id);

CREATE INDEX IF NOT EXISTS idx_target_portfolio_group_members_target_id
  ON folio.target_portfolio_group_members(target_portfolio_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE folio.target_portfolio_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio.target_portfolio_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS target_portfolio_groups_owner ON folio.target_portfolio_groups;
CREATE POLICY target_portfolio_groups_owner ON folio.target_portfolio_groups
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS target_portfolio_group_members_owner ON folio.target_portfolio_group_members;
CREATE POLICY target_portfolio_group_members_owner ON folio.target_portfolio_group_members
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT ALL ON folio.target_portfolio_groups        TO authenticated;
GRANT ALL ON folio.target_portfolio_group_members TO authenticated;
