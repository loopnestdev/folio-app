-- ============================================================
-- Migration 007 — add base_currency to portfolio_groups
--
-- base_currency is the currency all group-level reports are
-- expressed in (e.g. 'AUD' for an Australian investor).
-- Individual portfolio trades are converted at the stored
-- exchange_rate (for CGT) or the current rate (for live NAV).
-- ============================================================

ALTER TABLE folio.portfolio_groups
  ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'AUD'
    CHECK (char_length(base_currency) = 3);
