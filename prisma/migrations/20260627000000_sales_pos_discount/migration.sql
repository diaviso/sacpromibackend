-- Mode CAISSE (POS) pour les ventes au comptoir.
--
-- On enrichit SaleInvoice avec :
--   subtotalAmount : sous-total brut (somme des lineAmount)
--   discountAmount : remise globale appliquee (>= 0)
--   discountReason : motif libre de la remise
--
-- totalAmount (existant) devient le net = subtotalAmount - discountAmount.
-- Pour les factures existantes, on backfill subtotalAmount = totalAmount
-- (puisqu'il n'y avait pas de remise jusqu'a maintenant).
--
-- Migration idempotente.

ALTER TABLE "sale_invoices"
  ADD COLUMN IF NOT EXISTS "subtotalAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountReason" TEXT;

-- Backfill : factures existantes n'avaient pas de remise.
UPDATE "sale_invoices"
SET "subtotalAmount" = "totalAmount"
WHERE "subtotalAmount" = 0
  AND "totalAmount" > 0;
