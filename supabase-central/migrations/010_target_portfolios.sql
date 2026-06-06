-- ============================================================
-- Loopnest Central Database
-- Migration 010 — target portfolios (folio-app)
--
-- Two tables:
--   folio.target_portfolios  — named portfolio blueprints
--   folio.target_portfolio_items — stock/allocation line items
-- ============================================================

-- ── Target portfolios ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS folio.target_portfolios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_target_portfolios_updated_at ON folio.target_portfolios;
CREATE TRIGGER set_target_portfolios_updated_at
  BEFORE UPDATE ON folio.target_portfolios
  FOR EACH ROW EXECUTE FUNCTION folio.set_updated_at();

-- ── Target portfolio items ────────────────────────────────────
CREATE TABLE IF NOT EXISTS folio.target_portfolio_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_portfolio_id  UUID NOT NULL REFERENCES folio.target_portfolios(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol               TEXT NOT NULL,
  exchange             TEXT,
  category             TEXT,
  allocation_pct       NUMERIC(6,2) NOT NULL CHECK (allocation_pct > 0 AND allocation_pct <= 100),
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_target_portfolios_user_id
  ON folio.target_portfolios(user_id);

CREATE INDEX IF NOT EXISTS idx_target_portfolio_items_portfolio_id
  ON folio.target_portfolio_items(target_portfolio_id);

CREATE INDEX IF NOT EXISTS idx_target_portfolio_items_user_id
  ON folio.target_portfolio_items(user_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE folio.target_portfolios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio.target_portfolio_items ENABLE ROW LEVEL SECURITY;

-- target_portfolios: users can only see/modify their own rows
DROP POLICY IF EXISTS target_portfolios_owner ON folio.target_portfolios;
CREATE POLICY target_portfolios_owner ON folio.target_portfolios
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- target_portfolio_items: users can only see/modify their own rows
DROP POLICY IF EXISTS target_portfolio_items_owner ON folio.target_portfolio_items;
CREATE POLICY target_portfolio_items_owner ON folio.target_portfolio_items
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
