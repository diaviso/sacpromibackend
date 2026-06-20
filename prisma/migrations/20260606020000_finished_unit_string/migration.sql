-- Convertit FinishedProduct.unit d'un enum FinishedProductUnit à un texte
-- libre (max 20 caractères) pour permettre les unités métier custom
-- (carton, palette, sachet 5kg…). Les valeurs existantes (KG, TONNE,
-- BAG_25KG, BAG_50KG, HEAD, PIECE) sont conservées telles quelles dans
-- la colonne texte.
--
-- Migration idempotente : vérifie le type courant avant ALTER.

DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_name = 'finished_products' AND column_name = 'unit';

  -- Si la colonne est encore typée comme l'enum, on convertit
  IF current_type = 'USER-DEFINED' THEN
    ALTER TABLE "finished_products"
      ALTER COLUMN "unit" TYPE VARCHAR(20) USING "unit"::TEXT;
  END IF;
END $$;
