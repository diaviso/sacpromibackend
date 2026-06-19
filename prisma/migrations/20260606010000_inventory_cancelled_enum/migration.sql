-- Ajout de la valeur CANCELLED à l'enum InventoryStatus.
-- Migration idempotente : on vérifie d'abord la présence de la valeur.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'CANCELLED'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'InventoryStatus')
  ) THEN
    ALTER TYPE "InventoryStatus" ADD VALUE 'CANCELLED';
  END IF;
END $$;
