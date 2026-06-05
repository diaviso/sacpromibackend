-- AuditLog : journal complet des actions utilisateurs
-- Migration idempotente : safe à rejouer.

-- Enum AuditAction
DO $$ BEGIN
  CREATE TYPE "AuditAction" AS ENUM (
    'CREATE','UPDATE','DELETE',
    'CANCEL','REACTIVATE','VALIDATE','INVALIDATE',
    'LOGIN','LOGIN_FAILED','LOGOUT',
    'PASSWORD_CHANGE','PASSWORD_RESET',
    'ROLE_CHANGE','ACTIVATE','DEACTIVATE',
    'EXPORT','OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Table audit_logs
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id"           TEXT          NOT NULL,
  "userId"       TEXT,
  "userEmail"    TEXT,
  "userRole"     TEXT,
  "action"       "AuditAction" NOT NULL,
  "entityType"   TEXT,
  "entityId"     TEXT,
  "method"       TEXT          NOT NULL,
  "path"         TEXT          NOT NULL,
  "ipAddress"    TEXT,
  "userAgent"    TEXT,
  "statusCode"   INTEGER       NOT NULL,
  "durationMs"   INTEGER,
  "metadata"     JSONB,
  "errorMessage" TEXT,
  "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Index pour les requêtes courantes (filtre par user, type, date)
DO $$ BEGIN
  CREATE INDEX "audit_logs_userId_idx"            ON "audit_logs"("userId");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  CREATE INDEX "audit_logs_action_idx"            ON "audit_logs"("action");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType","entityId");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  CREATE INDEX "audit_logs_createdAt_idx"         ON "audit_logs"("createdAt");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- FK vers users(id) avec SET NULL pour préserver les lignes d'audit même
-- si l'utilisateur est supprimé.
DO $$ BEGIN
  ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
