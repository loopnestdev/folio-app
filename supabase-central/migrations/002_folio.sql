-- ============================================================
-- Loopnest Central Database
-- Migration 002 — folio schema (folio-app)
--
-- Key differences from the single-project migration:
--   • All tables live in the "folio" schema, not "public"
--   • No auth.users INSERT trigger — profiles are created
--     lazily by the backend on first authenticated request
--   • First-user-is-admin logic stays in the backend
--     (counts rows in folio.profiles only)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION (folio-scoped)
-- ============================================================
CREATE OR REPLACE FUNCTION folio.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS folio.profiles (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                TEXT NOT NULL,
  full_name            TEXT,
  avatar_url           TEXT,
  role                 TEXT NOT NULL DEFAULT 'standard'
                         CHECK (role IN ('admin', 'standard')),
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected')),
  chart_library        TEXT NOT NULL DEFAULT 'recharts'
                         CHECK (chart_library IN ('recharts', 'echarts')),
  financial_year_start TEXT NOT NULL DEFAULT 'july'
                         CHECK (financial_year_start IN ('january', 'july')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_profiles_updated_at ON folio.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON folio.profiles
  FOR EACH ROW EXECUTE FUNCTION folio.set_updated_at();

-- ============================================================
-- PORTFOLIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS folio.portfolios (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES folio.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  currency    TEXT NOT NULL DEFAULT 'AUD',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portfolios_user_id_idx ON folio.portfolios(user_id);

DROP TRIGGER IF EXISTS set_portfolios_updated_at ON folio.portfolios;
CREATE TRIGGER set_portfolios_updated_at
  BEFORE UPDATE ON folio.portfolios
  FOR EACH ROW EXECUTE FUNCTION folio.set_updated_at();

-- ============================================================
-- SECURITIES (master reference data)
-- ============================================================
CREATE TABLE IF NOT EXISTS folio.securities (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol     TEXT NOT NULL,
  name       TEXT,
  exchange   TEXT,
  sector     TEXT,
  industry   TEXT,
  country    TEXT,
  asset_type TEXT,
  currency   TEXT NOT NULL DEFAULT 'AUD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(symbol, exchange)
);

CREATE INDEX IF NOT EXISTS securities_symbol_idx ON folio.securities(symbol);

-- ============================================================
-- TRADES
-- ============================================================
CREATE TABLE IF NOT EXISTS folio.trades (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id  UUID NOT NULL REFERENCES folio.portfolios(id) ON DELETE CASCADE,
  security_id   UUID REFERENCES folio.securities(id),
  trade_date    DATE NOT NULL,
  trade_type    TEXT NOT NULL
                  CHECK (trade_type IN ('buy', 'sell', 'dividend', 'interest', 'drp', 'split')),
  quantity      NUMERIC(18, 6) NOT NULL DEFAULT 0,
  price         NUMERIC(18, 6) NOT NULL DEFAULT 0,
  brokerage     NUMERIC(18, 6) NOT NULL DEFAULT 0,
  gst           NUMERIC(18, 6) NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'AUD',
  exchange_rate NUMERIC(18, 6) NOT NULL DEFAULT 1,
  notes         TEXT,
  source        TEXT NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual', 'pdf_import')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trades_portfolio_id_idx   ON folio.trades(portfolio_id);
CREATE INDEX IF NOT EXISTS trades_security_id_idx    ON folio.trades(security_id);
CREATE INDEX IF NOT EXISTS trades_trade_date_idx     ON folio.trades(trade_date);
CREATE INDEX IF NOT EXISTS trades_portfolio_date_idx ON folio.trades(portfolio_id, trade_date);

DROP TRIGGER IF EXISTS set_trades_updated_at ON folio.trades;
CREATE TRIGGER set_trades_updated_at
  BEFORE UPDATE ON folio.trades
  FOR EACH ROW EXECUTE FUNCTION folio.set_updated_at();

-- ============================================================
-- PRICE HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS folio.price_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  security_id UUID NOT NULL REFERENCES folio.securities(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  close_price NUMERIC(18, 6) NOT NULL,
  UNIQUE(security_id, date)
);

CREATE INDEX IF NOT EXISTS price_history_security_date_idx
  ON folio.price_history(security_id, date);

-- ============================================================
-- BENCHMARK DATA
-- ============================================================
CREATE TABLE IF NOT EXISTS folio.benchmark_data (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  index_symbol TEXT NOT NULL,  -- ^AXJO, ^GSPC, ^IXIC
  date         DATE NOT NULL,
  close_price  NUMERIC(18, 6) NOT NULL,
  UNIQUE(index_symbol, date)
);

CREATE INDEX IF NOT EXISTS benchmark_data_symbol_date_idx
  ON folio.benchmark_data(index_symbol, date);

-- ============================================================
-- ADMIN HELPER (JWT-based — avoids RLS infinite recursion)
-- ============================================================
-- CRITICAL: This function must NOT query folio.profiles.
-- Doing so would cause PostgreSQL error 42P17 (infinite recursion)
-- because the SELECT policy on folio.profiles calls this function.
-- Instead we read the role from the JWT app_metadata claim, which
-- is set in auth.users.raw_app_meta_data by the backend on first
-- admin creation (see backend/src/routes/auth.ts).
CREATE OR REPLACE FUNCTION folio.is_admin()
RETURNS BOOLEAN AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE folio.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio.portfolios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio.trades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio.securities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio.benchmark_data ENABLE ROW LEVEL SECURITY;

-- Drop all policies first so this script is safe to re-run
DROP POLICY IF EXISTS "folio_profiles_select_own"              ON folio.profiles;
DROP POLICY IF EXISTS "folio_profiles_update_own"              ON folio.profiles;
DROP POLICY IF EXISTS "folio_profiles_admin_select"            ON folio.profiles;
DROP POLICY IF EXISTS "folio_profiles_admin_update"            ON folio.profiles;
DROP POLICY IF EXISTS "folio_profiles_service_insert"          ON folio.profiles;
DROP POLICY IF EXISTS "folio_portfolios_own"                   ON folio.portfolios;
DROP POLICY IF EXISTS "folio_trades_own"                       ON folio.trades;
DROP POLICY IF EXISTS "folio_securities_read"                  ON folio.securities;
DROP POLICY IF EXISTS "folio_price_history_read"               ON folio.price_history;
DROP POLICY IF EXISTS "folio_benchmark_data_read"              ON folio.benchmark_data;
DROP POLICY IF EXISTS "folio_securities_service_write"         ON folio.securities;
DROP POLICY IF EXISTS "folio_price_history_service_write"      ON folio.price_history;
DROP POLICY IF EXISTS "folio_benchmark_data_service_write"     ON folio.benchmark_data;

-- profiles: own row
CREATE POLICY "folio_profiles_select_own"
  ON folio.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "folio_profiles_update_own"
  ON folio.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- profiles: admin sees/updates all (JWT-based, no table self-reference)
CREATE POLICY "folio_profiles_admin_select"
  ON folio.profiles FOR SELECT
  USING (folio.is_admin());

CREATE POLICY "folio_profiles_admin_update"
  ON folio.profiles FOR UPDATE
  USING (folio.is_admin())
  WITH CHECK (folio.is_admin());

-- profiles: service role can insert (used by backend on first login)
CREATE POLICY "folio_profiles_service_insert"
  ON folio.profiles FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- portfolios: own rows only
CREATE POLICY "folio_portfolios_own"
  ON folio.portfolios FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- trades: via portfolio ownership
CREATE POLICY "folio_trades_own"
  ON folio.trades FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM folio.portfolios p
      WHERE p.id = portfolio_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM folio.portfolios p
      WHERE p.id = portfolio_id AND p.user_id = auth.uid()
    )
  );

-- securities, price_history, benchmark_data: public read, service role write
CREATE POLICY "folio_securities_read"     ON folio.securities     FOR SELECT USING (true);
CREATE POLICY "folio_price_history_read"  ON folio.price_history  FOR SELECT USING (true);
CREATE POLICY "folio_benchmark_data_read" ON folio.benchmark_data FOR SELECT USING (true);

CREATE POLICY "folio_securities_service_write"
  ON folio.securities FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "folio_price_history_service_write"
  ON folio.price_history FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "folio_benchmark_data_service_write"
  ON folio.benchmark_data FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- EXPLICIT GRANTS (belt-and-suspenders alongside default privs)
-- ============================================================
GRANT ALL ON ALL TABLES    IN SCHEMA folio TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA folio TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON folio.profiles   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON folio.portfolios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON folio.trades     TO authenticated;
GRANT SELECT ON folio.securities     TO authenticated;
GRANT SELECT ON folio.price_history  TO authenticated;
GRANT SELECT ON folio.benchmark_data TO authenticated;
