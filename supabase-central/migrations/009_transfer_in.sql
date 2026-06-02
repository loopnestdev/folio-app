-- ============================================================
-- Migration 009: Add transfer_in trade type
-- ============================================================
-- Extends the trade_type CHECK constraint to include 'transfer_in'
-- so shares received from another broker/account can be recorded
-- with a cost basis but without a cash outflow.
-- The constraint must be dropped and recreated (PostgreSQL limitation).
-- ============================================================

ALTER TABLE folio.trades
  DROP CONSTRAINT IF EXISTS trades_trade_type_check;

ALTER TABLE folio.trades
  ADD CONSTRAINT trades_trade_type_check
    CHECK (trade_type IN ('buy', 'sell', 'dividend', 'interest', 'drp', 'split', 'deposit', 'withdrawal', 'transfer_in'));
