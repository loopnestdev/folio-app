-- ============================================================
-- Migration 012: Add fx_transfer_in / fx_transfer_out trade types
-- ============================================================
-- Extends the trade_type CHECK constraint to include 'fx_transfer_in' and
-- 'fx_transfer_out' — an internal conversion between an account's own
-- currency sleeves (e.g. Moomoo's "Currency Exchange" AUD <-> USD transfer),
-- which is NOT new external capital. Previously these were recorded as
-- 'deposit'/'withdrawal', which incorrectly counted them as contributed/
-- withdrawn capital in return calculations (net_deposited, TWR external
-- flows) and in the "money I've put in" cash-flow report.
-- The constraint must be dropped and recreated (PostgreSQL limitation).
-- ============================================================

ALTER TABLE folio.trades
  DROP CONSTRAINT IF EXISTS trades_trade_type_check;

ALTER TABLE folio.trades
  ADD CONSTRAINT trades_trade_type_check
    CHECK (trade_type IN ('buy', 'sell', 'dividend', 'interest', 'other_income', 'drp', 'split', 'deposit', 'withdrawal', 'transfer_in', 'fx_transfer_in', 'fx_transfer_out'));

-- Reclassify existing rows that were imported as deposit/withdrawal but are
-- actually an internal FX transfer (notes set by moomoo.ts's Currency
-- Exchange handling, always starting with "FX Transfer").
UPDATE folio.trades
SET trade_type = 'fx_transfer_in'
WHERE trade_type = 'deposit'
  AND notes ILIKE 'FX Transfer%';

UPDATE folio.trades
SET trade_type = 'fx_transfer_out'
WHERE trade_type = 'withdrawal'
  AND notes ILIKE 'FX Transfer%';
