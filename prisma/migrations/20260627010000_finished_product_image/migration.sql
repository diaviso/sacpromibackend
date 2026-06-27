-- Ajout de l'image illustrative d'un produit fini.
-- Stockee comme FK -> Upload (categorie PRODUCT_IMAGE). Optionnelle.
-- Affichee dans le catalogue, la Caisse et les fiches detail produit.
--
-- Migration idempotente.

-- Nouvelle valeur d'enum pour la categorie d'upload.
DO $$ BEGIN
  ALTER TYPE "UploadCategory" ADD VALUE IF NOT EXISTS 'PRODUCT_IMAGE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "finished_products"
  ADD COLUMN IF NOT EXISTS "imageUploadId" TEXT;
