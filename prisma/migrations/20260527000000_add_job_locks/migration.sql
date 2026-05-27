-- =====================================================================
-- AddTable: job_locks
-- =====================================================================
-- Cette table sert de verrou idempotent pour les jobs cron (ex: génération
-- mensuelle des dépenses récurrentes, dotations d'amortissements).
-- La contrainte UNIQUE sur `key` empêche les doublons en cas de
-- redémarrage du conteneur ou de scaling horizontal.
--
-- Note : la table figure aussi dans la migration init (CREATE TABLE) car
-- elle fait partie du schéma cible pour un nouveau déploiement from-scratch.
-- Cette migration delta utilise CREATE TABLE IF NOT EXISTS pour rester
-- idempotente sur les bases qui auraient déjà été synchronisées via
-- `prisma db push` (notamment les environnements de dev).
-- =====================================================================

CREATE TABLE IF NOT EXISTS "job_locks" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedBy" TEXT,
    "note" TEXT,

    CONSTRAINT "job_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'job_locks_key_key') THEN
        CREATE UNIQUE INDEX "job_locks_key_key" ON "job_locks"("key");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'job_locks_key_idx') THEN
        CREATE INDEX "job_locks_key_idx" ON "job_locks"("key");
    END IF;
END$$;
