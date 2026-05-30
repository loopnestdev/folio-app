-- ============================================================
-- Migration 008: Add deposit/withdrawal trade types + cash tracking
-- ============================================================
-- Extends the trade_type CHECK constraint to include 'deposit' and
-- 'withdrawal' so cash movements can be tracked alongside trades.
-- The constraint must be dropped and recreated (PostgreSQL limitation).
-- ============================================================

ALTER TABLE folio.trades
  DROP CONSTRAINT IF EXISTS trades_trade_type_check;

ALTER TABLE folio.trades
  ADD CONSTRAINT trades_trade_type_check
    CHECK (trade_type IN ('buy', 'sell', 'dividend', 'interest', 'drp', 'split', 'deposit', 'withdrawal'));
