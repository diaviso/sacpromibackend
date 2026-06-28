-- Avoir fournisseur (SupplierCreditNote).
--
-- Permet de tracer un retour marchandise au fournisseur :
--   - Livraison non conforme (produits abimes, qualite insuffisante)
--   - Surfacturation
--   - Geste commercial du fournisseur
--
-- Effets metier (cote service) :
--   - Mouvement stock ADJUSTMENT(-qty) sur le lot d'origine
--   - Decrement currentStock de la matiere
--   - Decrement amountRemaining de la PurchaseInvoice parent
--   - Si facture deja payee : amountRemaining devient negatif = avoir
--     a utiliser sur prochaine facture
--
-- Migration idempotente.

CREATE TABLE IF NOT EXISTS "supplier_credit_notes" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "creditDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_credit_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_credit_notes_reference_key" ON "supplier_credit_notes"("reference");
CREATE INDEX IF NOT EXISTS "supplier_credit_notes_purchaseInvoiceId_idx" ON "supplier_credit_notes"("purchaseInvoiceId");
CREATE INDEX IF NOT EXISTS "supplier_credit_notes_supplierId_idx" ON "supplier_credit_notes"("supplierId");
CREATE INDEX IF NOT EXISTS "supplier_credit_notes_creditDate_idx" ON "supplier_credit_notes"("creditDate");
CREATE INDEX IF NOT EXISTS "supplier_credit_notes_reference_idx" ON "supplier_credit_notes"("reference");

CREATE TABLE IF NOT EXISTS "supplier_credit_note_items" (
    "id" TEXT NOT NULL,
    "supplierCreditNoteId" TEXT NOT NULL,
    "purchaseInvoiceItemId" TEXT,
    "rawMaterialId" TEXT NOT NULL,
    "rawMaterialLotId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "lineAmount" INTEGER NOT NULL,

    CONSTRAINT "supplier_credit_note_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "supplier_credit_note_items_supplierCreditNoteId_idx" ON "supplier_credit_note_items"("supplierCreditNoteId");
CREATE INDEX IF NOT EXISTS "supplier_credit_note_items_rawMaterialId_idx" ON "supplier_credit_note_items"("rawMaterialId");
CREATE INDEX IF NOT EXISTS "supplier_credit_note_items_rawMaterialLotId_idx" ON "supplier_credit_note_items"("rawMaterialLotId");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "supplier_credit_notes"
    ADD CONSTRAINT "supplier_credit_notes_purchaseInvoiceId_fkey"
    FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_credit_notes"
    ADD CONSTRAINT "supplier_credit_notes_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_credit_notes"
    ADD CONSTRAINT "supplier_credit_notes_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_credit_note_items"
    ADD CONSTRAINT "supplier_credit_note_items_supplierCreditNoteId_fkey"
    FOREIGN KEY ("supplierCreditNoteId") REFERENCES "supplier_credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_credit_note_items"
    ADD CONSTRAINT "supplier_credit_note_items_rawMaterialId_fkey"
    FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_credit_note_items"
    ADD CONSTRAINT "supplier_credit_note_items_rawMaterialLotId_fkey"
    FOREIGN KEY ("rawMaterialLotId") REFERENCES "raw_material_lots"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
