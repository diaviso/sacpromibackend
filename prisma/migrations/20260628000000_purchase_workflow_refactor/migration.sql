-- Refonte du workflow ACHATS.
--
-- Changements :
--   1. Nouveau statut BC : EXPIRED (BC valide jamais receptionne, retire du
--      portefeuille actif).
--   2. Nouveau champ PurchaseOrder.validatedAt — date de validation. Sert au
--      calcul d'expiration et a l'audit.
--
-- Migration idempotente.

DO $$ BEGIN
  ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'EXPIRED' BEFORE 'CANCELLED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "purchase_orders"
  ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMP(3);

-- Backfill : pour les BC deja en statut VALIDATED/PARTIALLY_DELIVERED/DELIVERED/CLOSED
-- on assume la date de creation comme date de validation (pas d'info plus
-- precise dispo). Pas critique en mode test.
UPDATE "purchase_orders"
SET "validatedAt" = "createdAt"
WHERE "validatedAt" IS NULL
  AND "status" IN ('VALIDATED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CLOSED');
