-- ============================================================
-- Migration 013: Add withholding_tax / withholding_tax_refund trade types
-- ============================================================
-- Extends the trade_type CHECK constraint to include 'withholding_tax' and
-- 'withholding_tax_refund' — tax a foreign payer withheld at source from a
-- dividend (Moomoo Corporate Action "WITHHOLDING TAX" lines), and Moomoo
-- refunding some of it later ("REVERSAL/ADJUSTMENT"). Previously these were
-- skipped on import, so the cash balance read higher than the broker's by
-- the tax withheld, and the tax report had no foreign-tax figure to base a
-- foreign income tax offset on. The dividend itself stays recorded gross.
-- The constraint must be dropped and recreated (PostgreSQL limitation).
--
-- No data is reclassified: withholding lines were never stored before.
-- To backfill history, re-import the monthly statements that contain
-- them — imports skip rows that already exist, so only the new
-- withholding rows are added.
-- ============================================================

ALTER TABLE folio.trades
  DROP CONSTRAINT IF EXISTS trades_trade_type_check;

ALTER TABLE folio.trades
  ADD CONSTRAINT trades_trade_type_check
    CHECK (trade_type IN ('buy', 'sell', 'dividend', 'interest', 'other_income', 'drp', 'split', 'deposit', 'withdrawal', 'transfer_in', 'fx_transfer_in', 'fx_transfer_out', 'withholding_tax', 'withholding_tax_refund'));
