-- ============================================================
-- Migration 011: Add other_income trade type
-- ============================================================
-- Extends the trade_type CHECK constraint to include 'other_income' —
-- cash income that is neither a dividend (paid on a shareholding) nor
-- interest (paid on a cash balance), e.g. broker referral/incentive
-- payments such as Moomoo's "Stock Cash Coupon". Previously these were
-- misclassified as 'interest'; this migration also reclassifies any
-- existing rows recorded that way.
-- The constraint must be dropped and recreated (PostgreSQL limitation).
-- ============================================================

ALTER TABLE folio.trades
  DROP CONSTRAINT IF EXISTS trades_trade_type_check;

ALTER TABLE folio.trades
  ADD CONSTRAINT trades_trade_type_check
    CHECK (trade_type IN ('buy', 'sell', 'dividend', 'interest', 'other_income', 'drp', 'split', 'deposit', 'withdrawal', 'transfer_in'));

-- Reclassify existing Moomoo "Stock Cash Coupon" / "Cash Voucher" referral-
-- bonus rows that were imported as 'interest' before this trade type existed.
UPDATE folio.trades
SET trade_type = 'other_income'
WHERE trade_type = 'interest'
  AND (notes ILIKE '%coupon%' OR notes ILIKE '%voucher%');
