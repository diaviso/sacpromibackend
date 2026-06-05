-- Singleton CompanySettings (id forcé à "default" côté service)
-- Migration idempotente : safe à rejouer ou à appliquer sur une base déjà sync.

CREATE TABLE IF NOT EXISTS "company_settings" (
  "id"               TEXT     NOT NULL DEFAULT 'default',
  "companyName"      TEXT     NOT NULL,
  "legalForm"        TEXT,
  "ninea"            TEXT,
  "rccm"             TEXT,
  "taxId"            TEXT,
  "addressLine1"     TEXT,
  "addressLine2"     TEXT,
  "city"             TEXT,
  "region"           TEXT,
  "country"          TEXT DEFAULT 'Sénégal',
  "phone"            TEXT,
  "phone2"           TEXT,
  "email"            TEXT,
  "website"          TEXT,
  "bankName"         TEXT,
  "bankAccount"      TEXT,
  "mobileMoney"      TEXT,
  "logoUploadId"     TEXT,
  "primaryColor"     TEXT DEFAULT '#047857',
  "secondaryColor"   TEXT DEFAULT '#0ea5e9',
  "footerLegalText"  TEXT,
  "footerNote"       TEXT,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById"      TEXT,
  CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- FK vers users(id) pour updatedById, SET NULL si l'utilisateur est supprimé
DO $$ BEGIN
  ALTER TABLE "company_settings"
    ADD CONSTRAINT "company_settings_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
