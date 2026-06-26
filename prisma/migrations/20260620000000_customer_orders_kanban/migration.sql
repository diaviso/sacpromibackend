-- Refonte commerciale : Kanban de gestion des commandes
--
-- 1. Nouveaux statuts intermediaires dans le flux operationnel :
--    IN_PREPARATION (commande passee en atelier de preparation)
--    READY_TO_DELIVER (preparation terminee, prete a livrer)
--
-- 2. Nouvel enum CustomerOrderPriority (LOW/NORMAL/HIGH/URGENT) pour
--    triage et affichage Kanban
--
-- 3. Champs ajoutes sur customer_orders :
--    - priority : niveau de priorite (defaut NORMAL)
--    - assignedToId : utilisateur en charge du suivi (FK users)
--    - internalNote : note interne pour l'equipe
--
-- Migration idempotente : tous les ALTERs sont protegees par des checks.

-- Enum priority (creation seulement si absent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomerOrderPriority') THEN
    CREATE TYPE "CustomerOrderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
  END IF;
END $$;

-- Ajout des nouveaux statuts a l'enum CustomerOrderStatus
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'IN_PREPARATION'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'CustomerOrderStatus')
  ) THEN
    ALTER TYPE "CustomerOrderStatus" ADD VALUE 'IN_PREPARATION' BEFORE 'PARTIALLY_DELIVERED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'READY_TO_DELIVER'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'CustomerOrderStatus')
  ) THEN
    ALTER TYPE "CustomerOrderStatus" ADD VALUE 'READY_TO_DELIVER' BEFORE 'PARTIALLY_DELIVERED';
  END IF;
END $$;

-- Colonnes customer_orders
ALTER TABLE "customer_orders"
  ADD COLUMN IF NOT EXISTS "priority" "CustomerOrderPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "assignedToId" TEXT,
  ADD COLUMN IF NOT EXISTS "internalNote" TEXT;

-- Foreign key vers users(id) en SET NULL (un user supprime laisse les
-- commandes assignees a personne au lieu de les casser)
DO $$
BEGIN
  ALTER TABLE "customer_orders"
    ADD CONSTRAINT "customer_orders_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index pour les filtres Kanban (par responsable, par priorite)
CREATE INDEX IF NOT EXISTS "customer_orders_assignedToId_idx"
  ON "customer_orders"("assignedToId");
CREATE INDEX IF NOT EXISTS "customer_orders_priority_idx"
  ON "customer_orders"("priority");
