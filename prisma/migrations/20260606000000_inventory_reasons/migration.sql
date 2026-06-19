-- Ajout des champs cancelReason et varianceReason pour la gestion fine
-- des inventaires (motif d'annulation + motif d'écart par ligne).
-- Migration idempotente : safe à rejouer.

ALTER TABLE "inventories"
  ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

ALTER TABLE "inventory_items"
  ADD COLUMN IF NOT EXISTS "varianceReason" TEXT;
