-- ============================================================
-- Folio App — Initial Schema Migration
-- Version: v0.1.0
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
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

-- ============================================================
-- PORTFOLIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.portfolios (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  currency    TEXT NOT NULL DEFAULT 'AUD',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portfolios_user_id_idx ON public.portfolios(user_id);

-- ============================================================
-- SECURITIES (master data)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.securities (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol     TEXT NOT NULL,
  name       TEXT,
  exchange   TEXT,
  sector     TEXT,
  industry   TEXT,
  country    TEXT,
  asset_type TEXT,  -- stock, etf, bond, crypto, index, etc.
  currency   TEXT NOT NULL DEFAULT 'AUD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(symbol, exchange)
);

CREATE INDEX IF NOT EXISTS securities_symbol_idx ON public.securities(symbol);

-- ============================================================
-- TRADES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trades (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id  UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  security_id   UUID REFERENCES public.securities(id),
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

CREATE INDEX IF NOT EXISTS trades_portfolio_id_idx    ON public.trades(portfolio_id);
CREATE INDEX IF NOT EXISTS trades_security_id_idx     ON public.trades(security_id);
CREATE INDEX IF NOT EXISTS trades_trade_date_idx      ON public.trades(trade_date);
CREATE INDEX IF NOT EXISTS trades_portfolio_date_idx  ON public.trades(portfolio_id, trade_date);

-- ============================================================
-- PRICE HISTORY (cached market prices)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.price_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  close_price NUMERIC(18, 6) NOT NULL,
  UNIQUE(security_id, date)
);

CREATE INDEX IF NOT EXISTS price_history_security_date_idx ON public.price_history(security_id, date);

-- ============================================================
-- BENCHMARK DATA (index historical prices)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.benchmark_data (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  index_symbol TEXT NOT NULL,  -- ^AXJO, ^GSPC, ^IXIC
  date         DATE NOT NULL,
  close_price  NUMERIC(18, 6) NOT NULL,
  UNIQUE(index_symbol, date)
);

CREATE INDEX IF NOT EXISTS benchmark_data_symbol_date_idx ON public.benchmark_data(index_symbol, date);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_portfolios_updated_at
  BEFORE UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_trades_updated_at
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON AUTH USER INSERT
-- First user gets admin + approved; everyone else gets pending
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_count INTEGER;
  user_role  TEXT;
  user_status TEXT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.profiles;

  IF user_count = 0 THEN
    user_role   := 'admin';
    user_status := 'approved';
  ELSE
    user_role   := 'standard';
    user_status := 'pending';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    user_role,
    user_status
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update all profiles (for approval)
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- PORTFOLIOS
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own portfolios"
  ON public.portfolios FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- TRADES (access via portfolio ownership)
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access trades in own portfolios"
  ON public.trades FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolios
      WHERE id = portfolio_id AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portfolios
      WHERE id = portfolio_id AND user_id = auth.uid()
    )
  );

-- SECURITIES: public read, service role write
ALTER TABLE public.securities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read securities"
  ON public.securities FOR SELECT
  USING (true);

CREATE POLICY "Service role can write securities"
  ON public.securities FOR ALL
  USING (auth.role() = 'service_role');

-- PRICE HISTORY: public read, service role write
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read price history"
  ON public.price_history FOR SELECT
  USING (true);

CREATE POLICY "Service role can write price history"
  ON public.price_history FOR ALL
  USING (auth.role() = 'service_role');

-- BENCHMARK DATA: public read, service role write
ALTER TABLE public.benchmark_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read benchmark data"
  ON public.benchmark_data FOR SELECT
  USING (true);

CREATE POLICY "Service role can write benchmark data"
  ON public.benchmark_data FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- GRANT PERMISSIONS TO AUTHENTICATED ROLE
-- ============================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.portfolios TO authenticated;
GRANT ALL ON public.trades TO authenticated;
GRANT SELECT ON public.securities TO authenticated;
GRANT SELECT ON public.price_history TO authenticated;
GRANT SELECT ON public.benchmark_data TO authenticated;

-- Grant service role full access (used by backend)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
