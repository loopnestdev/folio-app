-- ============================================================
-- Loopnest Central Database
-- Migration 003 — moat schema (moat-finder)
--
-- Adapted from moat-finder's individual migration files.
-- All tables moved from "public" to "moat" schema.
-- Trigger function renamed from moatfinder_set_updated_at
-- to moat.set_updated_at (schema-scoped).
-- No auth.users trigger — user rows created lazily by backend.
-- ============================================================

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION (moat-scoped)
-- ============================================================
CREATE OR REPLACE FUNCTION moat.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE moat.users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  role         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (role IN ('admin', 'approved', 'pending', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moat_users_role ON moat.users(role);

CREATE TRIGGER set_moat_users_updated_at
  BEFORE UPDATE ON moat.users
  FOR EACH ROW EXECUTE FUNCTION moat.set_updated_at();

-- ============================================================
-- TICKERS
-- ============================================================
CREATE TABLE moat.tickers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol              TEXT NOT NULL UNIQUE,
  company_name        TEXT,
  industry            TEXT,
  sector              TEXT,
  first_researched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_researched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  research_count      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_moat_tickers_symbol ON moat.tickers(symbol);

-- ============================================================
-- RESEARCH REPORTS (one current report per ticker)
-- ============================================================
CREATE TABLE moat.research_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_id     UUID NOT NULL REFERENCES moat.tickers(id) ON DELETE CASCADE,
  ticker_symbol TEXT NOT NULL,
  score         NUMERIC(3,1) CHECK (score >= 1.0 AND score <= 10.0),
  report_json   JSONB NOT NULL,
  diagram_json  JSONB NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  researched_by UUID REFERENCES moat.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticker_id)
);

CREATE INDEX idx_moat_research_ticker_symbol ON moat.research_reports(ticker_symbol);
CREATE INDEX idx_moat_research_score         ON moat.research_reports(score DESC);
CREATE INDEX idx_moat_research_updated       ON moat.research_reports(updated_at DESC);
CREATE INDEX idx_moat_research_report_gin    ON moat.research_reports USING GIN (report_json);

CREATE TRIGGER set_moat_research_reports_updated_at
  BEFORE UPDATE ON moat.research_reports
  FOR EACH ROW EXECUTE FUNCTION moat.set_updated_at();

-- ============================================================
-- RESEARCH VERSIONS (immutable history)
-- ============================================================
CREATE TABLE moat.research_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_id     UUID NOT NULL REFERENCES moat.tickers(id) ON DELETE CASCADE,
  ticker_symbol TEXT NOT NULL,
  version       INTEGER NOT NULL,
  score         NUMERIC(3,1),
  report_json   JSONB NOT NULL,
  diagram_json  JSONB NOT NULL,
  diff_json     JSONB,
  researched_by UUID REFERENCES moat.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticker_id, version)
);

CREATE INDEX idx_moat_versions_ticker ON moat.research_versions(ticker_id, version DESC);

-- ============================================================
-- AUDIT LOG (append-only)
-- ============================================================
CREATE TABLE moat.audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action       TEXT NOT NULL
                 CHECK (action IN (
                   'research_triggered',
                   'research_updated',
                   'report_viewed',
                   'report_searched',
                   'user_approved',
                   'user_rejected',
                   'login',
                   'logout'
                 )),
  ticker_symbol TEXT,
  user_id       UUID REFERENCES moat.users(id),
  ip_address    INET,
  user_agent    TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moat_audit_created  ON moat.audit_log(created_at DESC);
CREATE INDEX idx_moat_audit_ticker   ON moat.audit_log(ticker_symbol);
CREATE INDEX idx_moat_audit_user     ON moat.audit_log(user_id);
CREATE INDEX idx_moat_audit_action   ON moat.audit_log(action);
CREATE INDEX idx_moat_audit_metadata ON moat.audit_log USING GIN (metadata);

-- ============================================================
-- RESEARCH CHECKPOINTS (service role only)
-- ============================================================
CREATE TABLE moat.research_checkpoints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_symbol TEXT NOT NULL,
  run_id        UUID NOT NULL,
  step_number   INTEGER NOT NULL CHECK (step_number BETWEEN 1 AND 7),
  step_label    TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('complete', 'failed')),
  output_json   JSONB NOT NULL,
  tokens_used   INTEGER,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticker_symbol, run_id, step_number)
);

CREATE INDEX idx_moat_checkpoints_ticker ON moat.research_checkpoints(ticker_symbol);
CREATE INDEX idx_moat_checkpoints_run    ON moat.research_checkpoints(run_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE moat.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE moat.tickers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE moat.research_reports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE moat.research_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE moat.audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE moat.research_checkpoints ENABLE ROW LEVEL SECURITY;

-- users: own row read
CREATE POLICY "moat_users_select_own"
  ON moat.users FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- users: service role inserts (lazy creation on first login)
CREATE POLICY "moat_users_service_insert"
  ON moat.users FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- users: admin full access
CREATE POLICY "moat_users_admin_all"
  ON moat.users FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM moat.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM moat.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- tickers: public read
CREATE POLICY "moat_tickers_public_select"
  ON moat.tickers FOR SELECT USING (true);

-- tickers: approved users can insert
CREATE POLICY "moat_tickers_approved_insert"
  ON moat.tickers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM moat.users u
      WHERE u.id = auth.uid() AND u.role IN ('approved', 'admin')
    )
  );

-- tickers: admin full access
CREATE POLICY "moat_tickers_admin_all"
  ON moat.tickers FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM moat.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM moat.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- research_reports: public read
CREATE POLICY "moat_reports_public_select"
  ON moat.research_reports FOR SELECT USING (true);

-- research_reports: approved insert/update
CREATE POLICY "moat_reports_approved_insert"
  ON moat.research_reports FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM moat.users u
      WHERE u.id = auth.uid() AND u.role IN ('approved', 'admin')
    )
  );

CREATE POLICY "moat_reports_approved_update"
  ON moat.research_reports FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM moat.users u
      WHERE u.id = auth.uid() AND u.role IN ('approved', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM moat.users u
      WHERE u.id = auth.uid() AND u.role IN ('approved', 'admin')
    )
  );

-- research_reports: admin full access
CREATE POLICY "moat_reports_admin_all"
  ON moat.research_reports FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM moat.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM moat.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- research_versions: public read, approved insert, admin all
CREATE POLICY "moat_versions_public_select"
  ON moat.research_versions FOR SELECT USING (true);

CREATE POLICY "moat_versions_approved_insert"
  ON moat.research_versions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM moat.users u
      WHERE u.id = auth.uid() AND u.role IN ('approved', 'admin')
    )
  );

CREATE POLICY "moat_versions_admin_all"
  ON moat.research_versions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM moat.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM moat.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- audit_log: admin read only; service role inserts via bypass
CREATE POLICY "moat_audit_admin_select"
  ON moat.audit_log FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM moat.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "moat_audit_service_insert"
  ON moat.audit_log FOR INSERT
  WITH CHECK (true);  -- service_role bypasses RLS; this covers edge-function paths

-- research_checkpoints: service role only (no authenticated policies = deny all)
CREATE POLICY "moat_checkpoints_service_only"
  ON moat.research_checkpoints FOR ALL TO service_role
  USING (true);

-- ============================================================
-- EXPLICIT GRANTS
-- ============================================================
GRANT ALL ON ALL TABLES    IN SCHEMA moat TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA moat TO service_role;

GRANT SELECT ON moat.tickers           TO authenticated, anon;
GRANT SELECT ON moat.research_reports  TO authenticated, anon;
GRANT SELECT ON moat.research_versions TO authenticated, anon;

GRANT SELECT, INSERT, UPDATE ON moat.users           TO authenticated;
GRANT INSERT                 ON moat.research_reports TO authenticated;
GRANT INSERT                 ON moat.research_versions TO authenticated;
GRANT INSERT                 ON moat.audit_log         TO authenticated;
GRANT INSERT                 ON moat.tickers           TO authenticated;
