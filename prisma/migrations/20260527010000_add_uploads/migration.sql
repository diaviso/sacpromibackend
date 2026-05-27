-- =====================================================================
-- AddEnum: UploadCategory  + AddTable: uploads
-- =====================================================================
-- Justificatifs : scans factures, photos dépenses, contrats de prêt,
-- documents d'apport en capital, etc.
-- Idempotent : CREATE IF NOT EXISTS pour resister aux bases qui auraient
-- ete deja synchronisees via `prisma db push`.
-- =====================================================================

DO $$ BEGIN
    CREATE TYPE "UploadCategory" AS ENUM (
        'PURCHASE_INVOICE_SCAN',
        'EXPENSE_RECEIPT',
        'FIXED_ASSET_DOCUMENT',
        'LOAN_CONTRACT',
        'CAPITAL_DOCUMENT',
        'GENERIC'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "uploads" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "category" "UploadCategory" NOT NULL DEFAULT 'GENERIC',
    "uploadedById" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uploads_storageKey_key') THEN
        CREATE UNIQUE INDEX "uploads_storageKey_key" ON "uploads"("storageKey");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uploads_uploadedById_idx') THEN
        CREATE INDEX "uploads_uploadedById_idx" ON "uploads"("uploadedById");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uploads_referenceType_referenceId_idx') THEN
        CREATE INDEX "uploads_referenceType_referenceId_idx" ON "uploads"("referenceType", "referenceId");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uploads_category_idx') THEN
        CREATE INDEX "uploads_category_idx" ON "uploads"("category");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uploads_createdAt_idx') THEN
        CREATE INDEX "uploads_createdAt_idx" ON "uploads"("createdAt");
    END IF;
END $$;

DO $$ BEGIN
    ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
