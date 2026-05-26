-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DIRECTOR', 'PRODUCTION_MANAGER', 'BREEDING_MANAGER', 'SALES_MANAGER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'VALIDATED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CHECK', 'WAVE', 'ORANGE_MONEY', 'OTHER');

-- CreateEnum
CREATE TYPE "RawMaterialCategory" AS ENUM ('CEREALS', 'PROTEINS', 'PREMIX_MINERALS', 'OTHER');

-- CreateEnum
CREATE TYPE "MeasurementUnit" AS ENUM ('KG', 'TONNE', 'LITER', 'BAG', 'PIECE');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RawStockMovementType" AS ENUM ('ENTRY_PURCHASE', 'EXIT_PRODUCTION', 'EXIT_BREEDING', 'LOSS', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "InventoryType" AS ENUM ('RAW_MATERIAL', 'FINISHED_PRODUCT');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('IN_PROGRESS', 'VALIDATED');

-- CreateEnum
CREATE TYPE "StockReferenceType" AS ENUM ('PURCHASE_INVOICE', 'PRODUCTION_ORDER', 'BREEDING_BATCH', 'INVENTORY', 'MANUAL', 'SALE_INVOICE');

-- CreateEnum
CREATE TYPE "FinishedProductCategory" AS ENUM ('POULTRY_FEED', 'CATTLE_FEED', 'LIVE_CHICKEN', 'SLAUGHTERED_CHICKEN', 'OTHER');

-- CreateEnum
CREATE TYPE "FinishedProductUnit" AS ENUM ('KG', 'TONNE', 'BAG_25KG', 'BAG_50KG', 'HEAD', 'PIECE');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinishedLotSource" AS ENUM ('PRODUCTION', 'BREEDING');

-- CreateEnum
CREATE TYPE "FinishedStockMovementType" AS ENUM ('ENTRY_PRODUCTION', 'ENTRY_BREEDING', 'EXIT_SALE', 'EXIT_BREEDING_FEED', 'LOSS', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BreedingBatchStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('BREEDER', 'RESELLER', 'INDIVIDUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomerPriceCategory" AS ENUM ('WHOLESALE', 'RETAIL');

-- CreateEnum
CREATE TYPE "CustomerOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleInvoiceType" AS ENUM ('INVOICE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "SalePaymentMethod" AS ENUM ('CASH', 'WAVE', 'ORANGE_MONEY', 'TRANSFER', 'CHECK', 'CREDIT');

-- CreateEnum
CREATE TYPE "ExpenseActivity" AS ENUM ('PRODUCTION', 'BREEDING', 'COMMERCIAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('CONFIRMED', 'PENDING_CONFIRMATION');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'MOBILE_MONEY', 'E_WALLET');

-- CreateEnum
CREATE TYPE "TreasuryEntrySource" AS ENUM ('OPENING_BALANCE', 'SUPPLIER_PAYMENT', 'CUSTOMER_PAYMENT', 'EXPENSE', 'LOAN_DISBURSEMENT', 'LOAN_PAYMENT', 'ACCOUNT_TRANSFER', 'CAPITAL_MOVEMENT', 'MANUAL_ADJUSTMENT', 'FIXED_ASSET_ACQUISITION');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'CLOSED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "LoanScheduleItemStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "FixedAssetCategory" AS ENUM ('VEHICLE', 'EQUIPMENT', 'BUILDING', 'LAND', 'IT_HARDWARE', 'FURNITURE', 'OTHER');

-- CreateEnum
CREATE TYPE "FixedAssetStatus" AS ENUM ('IN_SERVICE', 'SOLD', 'SCRAPPED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'DECLINING_BALANCE');

-- CreateEnum
CREATE TYPE "CapitalMovementType" AS ENUM ('CONTRIBUTION', 'WITHDRAWAL', 'SUBSIDY', 'GRANT', 'DIVIDEND');

-- CreateEnum
CREATE TYPE "VaccinationRoute" AS ENUM ('EYE_DROP', 'DRINKING_WATER', 'INJECTION', 'SPRAY', 'WING_WEB');

-- CreateEnum
CREATE TYPE "VaccinationStatus" AS ENUM ('PLANNED', 'DONE', 'SKIPPED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "FeedingPhase" AS ENUM ('STARTER', 'GROWER', 'FINISHER', 'WITHDRAWAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revoked_tokens" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_locks" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedBy" TEXT,
    "note" TEXT,

    CONSTRAINT "job_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT,
    "productsSupplied" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "expectedDate" TIMESTAMP(3),
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "rawMaterialId" TEXT,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantityOrdered" DECIMAL(14,4) NOT NULL,
    "unitPriceEstimate" INTEGER NOT NULL,
    "lineAmount" INTEGER NOT NULL,
    "quantityDelivered" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "supplierInvoiceNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "receptionDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "amountRemaining" INTEGER NOT NULL DEFAULT 0,
    "totalTransportCost" INTEGER NOT NULL DEFAULT 0,
    "scanUrl" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_items" (
    "id" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "transportCost" INTEGER NOT NULL DEFAULT 0,
    "lineAmount" INTEGER NOT NULL,
    "lotNumber" TEXT,
    "expirationDate" TIMESTAMP(3),

    CONSTRAINT "purchase_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "accountId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_materials" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "RawMaterialCategory" NOT NULL,
    "unit" "MeasurementUnit" NOT NULL,
    "weightPerBag" DECIMAL(10,4),
    "averagePrice" INTEGER NOT NULL DEFAULT 0,
    "currentStock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "alertThreshold" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_lots" (
    "id" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT,
    "supplierId" TEXT,
    "initialQuantity" DECIMAL(14,4) NOT NULL,
    "remainingQuantity" DECIMAL(14,4) NOT NULL,
    "receptionDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "unitAcquisitionPrice" INTEGER NOT NULL,
    "transportCost" INTEGER NOT NULL DEFAULT 0,
    "status" "LotStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_material_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_stock_movements" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "lotId" TEXT,
    "type" "RawStockMovementType" NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceType" "StockReferenceType",
    "referenceId" TEXT,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventories" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "InventoryType" NOT NULL,
    "inventoryDate" TIMESTAMP(3) NOT NULL,
    "status" "InventoryStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "rawMaterialId" TEXT,
    "finishedProductId" TEXT,
    "theoreticalStock" DECIMAL(14,4) NOT NULL,
    "actualStock" DECIMAL(14,4),
    "variance" DECIMAL(14,4),
    "variancePercent" DECIMAL(8,2),

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conservation_costs" (
    "id" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conservation_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finished_products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FinishedProductCategory" NOT NULL,
    "unit" "FinishedProductUnit" NOT NULL,
    "wholesalePrice" INTEGER NOT NULL DEFAULT 0,
    "retailPrice" INTEGER NOT NULL DEFAULT 0,
    "averageCost" INTEGER NOT NULL DEFAULT 0,
    "currentStock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "alertThreshold" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finished_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formulas" (
    "id" TEXT NOT NULL,
    "finishedProductId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "productionUnit" TEXT NOT NULL,
    "unitWeightKg" DECIMAL(10,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "technicalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formula_items" (
    "id" TEXT NOT NULL,
    "formulaId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "proportion" DECIMAL(8,4) NOT NULL,

    CONSTRAINT "formula_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "formulaId" TEXT NOT NULL,
    "finishedProductId" TEXT NOT NULL,
    "targetQuantity" DECIMAL(14,4) NOT NULL,
    "producedQuantity" DECIMAL(14,4),
    "productionLoss" DECIMAL(14,4),
    "productionDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'PLANNED',
    "totalMaterialsCost" INTEGER NOT NULL DEFAULT 0,
    "transformationCost" INTEGER NOT NULL DEFAULT 0,
    "totalCost" INTEGER NOT NULL DEFAULT 0,
    "unitCost" INTEGER NOT NULL DEFAULT 0,
    "cancelReason" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finished_product_lots" (
    "id" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "finishedProductId" TEXT NOT NULL,
    "source" "FinishedLotSource" NOT NULL,
    "productionOrderId" TEXT,
    "initialQuantity" DECIMAL(14,4) NOT NULL,
    "remainingQuantity" DECIMAL(14,4) NOT NULL,
    "manufactureDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "unitCost" INTEGER NOT NULL,
    "status" "LotStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "breedingBatchId" TEXT,

    CONSTRAINT "finished_product_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finished_stock_movements" (
    "id" TEXT NOT NULL,
    "finishedProductId" TEXT NOT NULL,
    "lotId" TEXT,
    "type" "FinishedStockMovementType" NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceType" "StockReferenceType",
    "referenceId" TEXT,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finished_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeding_batches" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "closeDate" TIMESTAMP(3),
    "strain" TEXT NOT NULL,
    "initialCount" INTEGER NOT NULL,
    "currentCount" INTEGER NOT NULL,
    "chickSupplier" TEXT NOT NULL,
    "chicksCost" INTEGER NOT NULL,
    "averageWeight" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "status" "BreedingBatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "fixedCharges" INTEGER NOT NULL DEFAULT 0,
    "totalFeedCost" INTEGER NOT NULL DEFAULT 0,
    "totalVetCost" INTEGER NOT NULL DEFAULT 0,
    "totalCost" INTEGER NOT NULL DEFAULT 0,
    "costPerHead" INTEGER NOT NULL DEFAULT 0,
    "slaughterCost" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "targetWeightGrams" INTEGER NOT NULL DEFAULT 2000,
    "targetCycleDays" INTEGER NOT NULL DEFAULT 45,
    "mortalityAlertPercent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "expectedSalePricePerKg" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breeding_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeding_weighings" (
    "id" TEXT NOT NULL,
    "breedingBatchId" TEXT NOT NULL,
    "weighingDate" TIMESTAMP(3) NOT NULL,
    "ageDays" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "averageWeightGrams" INTEGER NOT NULL,
    "minWeightGrams" INTEGER,
    "maxWeightGrams" INTEGER,
    "uniformityPercent" DECIMAL(5,2),
    "observations" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "breeding_weighings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeding_vaccinations" (
    "id" TEXT NOT NULL,
    "breedingBatchId" TEXT NOT NULL,
    "vaccineName" TEXT NOT NULL,
    "targetAgeDays" INTEGER NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "actualDate" TIMESTAMP(3),
    "dose" TEXT,
    "route" "VaccinationRoute" NOT NULL,
    "supplier" TEXT,
    "batchNumber" TEXT,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "status" "VaccinationStatus" NOT NULL DEFAULT 'PLANNED',
    "skipReason" TEXT,
    "observations" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breeding_vaccinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeding_feeding_phases" (
    "id" TEXT NOT NULL,
    "breedingBatchId" TEXT NOT NULL,
    "phase" "FeedingPhase" NOT NULL,
    "startDay" INTEGER NOT NULL,
    "endDay" INTEGER NOT NULL,
    "feedFinishedProductId" TEXT,
    "dailyFeedPerHeadGrams" INTEGER NOT NULL,
    "technicalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "breeding_feeding_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeding_records" (
    "id" TEXT NOT NULL,
    "breedingBatchId" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "mortality" INTEGER NOT NULL DEFAULT 0,
    "mortalityCause" TEXT,
    "feedFinishedProductId" TEXT,
    "feedQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "feedCost" INTEGER NOT NULL DEFAULT 0,
    "averageWeight" DECIMAL(10,4),
    "vetTreatment" TEXT,
    "vetCost" INTEGER NOT NULL DEFAULT 0,
    "observations" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "breeding_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT,
    "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "priceCategory" "CustomerPriceCategory" NOT NULL DEFAULT 'RETAIL',
    "paymentTerms" TEXT,
    "creditLimit" INTEGER NOT NULL DEFAULT 0,
    "isWalkIn" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "expectedDate" TIMESTAMP(3),
    "status" "CustomerOrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_order_items" (
    "id" TEXT NOT NULL,
    "customerOrderId" TEXT NOT NULL,
    "finishedProductId" TEXT NOT NULL,
    "quantityOrdered" DECIMAL(14,4) NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "lineAmount" INTEGER NOT NULL,
    "quantityDelivered" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "customer_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_invoices" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "SaleInvoiceType" NOT NULL DEFAULT 'INVOICE',
    "customerId" TEXT NOT NULL,
    "customerOrderId" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" "SalePaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "amountRemaining" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "parentInvoiceId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_invoice_items" (
    "id" TEXT NOT NULL,
    "saleInvoiceId" TEXT NOT NULL,
    "finishedProductId" TEXT NOT NULL,
    "finishedLotId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "lineAmount" INTEGER NOT NULL,

    CONSTRAINT "sale_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finished_product_price_history" (
    "id" TEXT NOT NULL,
    "finishedProductId" TEXT NOT NULL,
    "customerId" TEXT,
    "saleInvoiceId" TEXT,
    "unitPrice" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finished_product_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payments" (
    "id" TEXT NOT NULL,
    "saleInvoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "SalePaymentMethod" NOT NULL,
    "accountId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "activity" "ExpenseActivity" NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "beneficiary" TEXT,
    "receiptUrl" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'CONFIRMED',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceDayOfMonth" INTEGER,
    "parentRecurringId" TEXT,
    "accountId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_counters" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequence_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "openingBalance" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_entries" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" "TreasuryEntrySource" NOT NULL,
    "supplierPaymentId" TEXT,
    "customerPaymentId" TEXT,
    "expenseId" TEXT,
    "loanId" TEXT,
    "loanPaymentId" TEXT,
    "accountTransferId" TEXT,
    "capitalMovementId" TEXT,
    "fixedAssetId" TEXT,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treasury_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_transfers" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL,
    "fees" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "principalAmount" INTEGER NOT NULL,
    "annualInterestRate" DECIMAL(6,4) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "firstPaymentDate" TIMESTAMP(3) NOT NULL,
    "disbursementAccountId" TEXT,
    "paymentDayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalToRepay" INTEGER NOT NULL DEFAULT 0,
    "totalInterest" INTEGER NOT NULL DEFAULT 0,
    "remainingPrincipal" INTEGER NOT NULL DEFAULT 0,
    "contractScanUrl" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_schedule_items" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "installmentNo" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "principalDue" INTEGER NOT NULL,
    "interestDue" INTEGER NOT NULL,
    "totalDue" INTEGER NOT NULL,
    "remainingBalance" INTEGER NOT NULL,
    "status" "LoanScheduleItemStatus" NOT NULL DEFAULT 'PENDING',
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "loan_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_payments" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "principalPart" INTEGER NOT NULL,
    "interestPart" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FixedAssetCategory" NOT NULL,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "acquisitionCost" INTEGER NOT NULL,
    "salvageValue" INTEGER NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "method" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "decliningRate" DECIMAL(6,4),
    "status" "FixedAssetStatus" NOT NULL DEFAULT 'IN_SERVICE',
    "paymentAccountId" TEXT,
    "recordPurchaseAsTreasury" BOOLEAN NOT NULL DEFAULT true,
    "serialNumber" TEXT,
    "location" TEXT,
    "disposalDate" TIMESTAMP(3),
    "disposalAmount" INTEGER,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depreciation_entries" (
    "id" TEXT NOT NULL,
    "fixedAssetId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "accumulatedDepreciation" INTEGER NOT NULL,
    "netBookValue" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "depreciation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capital_movements" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "CapitalMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "contributorName" TEXT,
    "description" TEXT,
    "documentUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capital_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "revoked_tokens_jti_key" ON "revoked_tokens"("jti");

-- CreateIndex
CREATE INDEX "revoked_tokens_jti_idx" ON "revoked_tokens"("jti");

-- CreateIndex
CREATE INDEX "revoked_tokens_userId_idx" ON "revoked_tokens"("userId");

-- CreateIndex
CREATE INDEX "revoked_tokens_expiresAt_idx" ON "revoked_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_locks_key_key" ON "job_locks"("key");

-- CreateIndex
CREATE INDEX "job_locks_key_idx" ON "job_locks"("key");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "suppliers_isActive_idx" ON "suppliers"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_reference_key" ON "purchase_orders"("reference");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_orderDate_idx" ON "purchase_orders"("orderDate");

-- CreateIndex
CREATE INDEX "purchase_orders_reference_idx" ON "purchase_orders"("reference");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchaseOrderId_idx" ON "purchase_order_items"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_order_items_rawMaterialId_idx" ON "purchase_order_items"("rawMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_reference_key" ON "purchase_invoices"("reference");

-- CreateIndex
CREATE INDEX "purchase_invoices_supplierId_idx" ON "purchase_invoices"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_invoices_purchaseOrderId_idx" ON "purchase_invoices"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_invoices_paymentStatus_idx" ON "purchase_invoices"("paymentStatus");

-- CreateIndex
CREATE INDEX "purchase_invoices_invoiceDate_idx" ON "purchase_invoices"("invoiceDate");

-- CreateIndex
CREATE INDEX "purchase_invoices_reference_idx" ON "purchase_invoices"("reference");

-- CreateIndex
CREATE INDEX "purchase_invoice_items_purchaseInvoiceId_idx" ON "purchase_invoice_items"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "purchase_invoice_items_rawMaterialId_idx" ON "purchase_invoice_items"("rawMaterialId");

-- CreateIndex
CREATE INDEX "supplier_payments_purchaseInvoiceId_idx" ON "supplier_payments"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "supplier_payments_accountId_idx" ON "supplier_payments"("accountId");

-- CreateIndex
CREATE INDEX "supplier_payments_paymentDate_idx" ON "supplier_payments"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "raw_materials_code_key" ON "raw_materials"("code");

-- CreateIndex
CREATE INDEX "raw_materials_code_idx" ON "raw_materials"("code");

-- CreateIndex
CREATE INDEX "raw_materials_category_idx" ON "raw_materials"("category");

-- CreateIndex
CREATE INDEX "raw_materials_isActive_idx" ON "raw_materials"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "raw_material_lots_lotNumber_key" ON "raw_material_lots"("lotNumber");

-- CreateIndex
CREATE INDEX "raw_material_lots_rawMaterialId_idx" ON "raw_material_lots"("rawMaterialId");

-- CreateIndex
CREATE INDEX "raw_material_lots_status_idx" ON "raw_material_lots"("status");

-- CreateIndex
CREATE INDEX "raw_material_lots_receptionDate_idx" ON "raw_material_lots"("receptionDate");

-- CreateIndex
CREATE INDEX "raw_material_lots_expirationDate_idx" ON "raw_material_lots"("expirationDate");

-- CreateIndex
CREATE INDEX "raw_stock_movements_rawMaterialId_idx" ON "raw_stock_movements"("rawMaterialId");

-- CreateIndex
CREATE INDEX "raw_stock_movements_type_idx" ON "raw_stock_movements"("type");

-- CreateIndex
CREATE INDEX "raw_stock_movements_movementDate_idx" ON "raw_stock_movements"("movementDate");

-- CreateIndex
CREATE INDEX "raw_stock_movements_referenceType_referenceId_idx" ON "raw_stock_movements"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "inventories_reference_key" ON "inventories"("reference");

-- CreateIndex
CREATE INDEX "inventories_type_idx" ON "inventories"("type");

-- CreateIndex
CREATE INDEX "inventories_status_idx" ON "inventories"("status");

-- CreateIndex
CREATE INDEX "inventories_inventoryDate_idx" ON "inventories"("inventoryDate");

-- CreateIndex
CREATE INDEX "inventory_items_inventoryId_idx" ON "inventory_items"("inventoryId");

-- CreateIndex
CREATE INDEX "inventory_items_rawMaterialId_idx" ON "inventory_items"("rawMaterialId");

-- CreateIndex
CREATE INDEX "inventory_items_finishedProductId_idx" ON "inventory_items"("finishedProductId");

-- CreateIndex
CREATE INDEX "conservation_costs_periodStart_idx" ON "conservation_costs"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "conservation_costs_periodStart_periodEnd_key" ON "conservation_costs"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "finished_products_code_key" ON "finished_products"("code");

-- CreateIndex
CREATE INDEX "finished_products_code_idx" ON "finished_products"("code");

-- CreateIndex
CREATE INDEX "finished_products_category_idx" ON "finished_products"("category");

-- CreateIndex
CREATE INDEX "finished_products_isActive_idx" ON "finished_products"("isActive");

-- CreateIndex
CREATE INDEX "formulas_finishedProductId_idx" ON "formulas"("finishedProductId");

-- CreateIndex
CREATE INDEX "formulas_isActive_idx" ON "formulas"("isActive");

-- CreateIndex
CREATE INDEX "formula_items_formulaId_idx" ON "formula_items"("formulaId");

-- CreateIndex
CREATE INDEX "formula_items_rawMaterialId_idx" ON "formula_items"("rawMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_reference_key" ON "production_orders"("reference");

-- CreateIndex
CREATE INDEX "production_orders_finishedProductId_idx" ON "production_orders"("finishedProductId");

-- CreateIndex
CREATE INDEX "production_orders_status_idx" ON "production_orders"("status");

-- CreateIndex
CREATE INDEX "production_orders_productionDate_idx" ON "production_orders"("productionDate");

-- CreateIndex
CREATE INDEX "production_orders_reference_idx" ON "production_orders"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "finished_product_lots_lotNumber_key" ON "finished_product_lots"("lotNumber");

-- CreateIndex
CREATE INDEX "finished_product_lots_finishedProductId_idx" ON "finished_product_lots"("finishedProductId");

-- CreateIndex
CREATE INDEX "finished_product_lots_breedingBatchId_idx" ON "finished_product_lots"("breedingBatchId");

-- CreateIndex
CREATE INDEX "finished_product_lots_status_idx" ON "finished_product_lots"("status");

-- CreateIndex
CREATE INDEX "finished_product_lots_manufactureDate_idx" ON "finished_product_lots"("manufactureDate");

-- CreateIndex
CREATE INDEX "finished_product_lots_expirationDate_idx" ON "finished_product_lots"("expirationDate");

-- CreateIndex
CREATE INDEX "finished_stock_movements_finishedProductId_idx" ON "finished_stock_movements"("finishedProductId");

-- CreateIndex
CREATE INDEX "finished_stock_movements_type_idx" ON "finished_stock_movements"("type");

-- CreateIndex
CREATE INDEX "finished_stock_movements_movementDate_idx" ON "finished_stock_movements"("movementDate");

-- CreateIndex
CREATE INDEX "finished_stock_movements_referenceType_referenceId_idx" ON "finished_stock_movements"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "breeding_batches_reference_key" ON "breeding_batches"("reference");

-- CreateIndex
CREATE INDEX "breeding_batches_status_idx" ON "breeding_batches"("status");

-- CreateIndex
CREATE INDEX "breeding_batches_startDate_idx" ON "breeding_batches"("startDate");

-- CreateIndex
CREATE INDEX "breeding_batches_reference_idx" ON "breeding_batches"("reference");

-- CreateIndex
CREATE INDEX "breeding_weighings_breedingBatchId_idx" ON "breeding_weighings"("breedingBatchId");

-- CreateIndex
CREATE INDEX "breeding_weighings_weighingDate_idx" ON "breeding_weighings"("weighingDate");

-- CreateIndex
CREATE INDEX "breeding_vaccinations_breedingBatchId_idx" ON "breeding_vaccinations"("breedingBatchId");

-- CreateIndex
CREATE INDEX "breeding_vaccinations_status_idx" ON "breeding_vaccinations"("status");

-- CreateIndex
CREATE INDEX "breeding_vaccinations_plannedDate_idx" ON "breeding_vaccinations"("plannedDate");

-- CreateIndex
CREATE INDEX "breeding_feeding_phases_breedingBatchId_idx" ON "breeding_feeding_phases"("breedingBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "breeding_feeding_phases_breedingBatchId_phase_key" ON "breeding_feeding_phases"("breedingBatchId", "phase");

-- CreateIndex
CREATE INDEX "breeding_records_breedingBatchId_idx" ON "breeding_records"("breedingBatchId");

-- CreateIndex
CREATE INDEX "breeding_records_recordDate_idx" ON "breeding_records"("recordDate");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customers_type_idx" ON "customers"("type");

-- CreateIndex
CREATE INDEX "customers_priceCategory_idx" ON "customers"("priceCategory");

-- CreateIndex
CREATE INDEX "customers_isActive_idx" ON "customers"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "customer_orders_reference_key" ON "customer_orders"("reference");

-- CreateIndex
CREATE INDEX "customer_orders_customerId_idx" ON "customer_orders"("customerId");

-- CreateIndex
CREATE INDEX "customer_orders_status_idx" ON "customer_orders"("status");

-- CreateIndex
CREATE INDEX "customer_orders_orderDate_idx" ON "customer_orders"("orderDate");

-- CreateIndex
CREATE INDEX "customer_orders_reference_idx" ON "customer_orders"("reference");

-- CreateIndex
CREATE INDEX "customer_order_items_customerOrderId_idx" ON "customer_order_items"("customerOrderId");

-- CreateIndex
CREATE INDEX "customer_order_items_finishedProductId_idx" ON "customer_order_items"("finishedProductId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_invoices_reference_key" ON "sale_invoices"("reference");

-- CreateIndex
CREATE INDEX "sale_invoices_customerId_idx" ON "sale_invoices"("customerId");

-- CreateIndex
CREATE INDEX "sale_invoices_customerOrderId_idx" ON "sale_invoices"("customerOrderId");

-- CreateIndex
CREATE INDEX "sale_invoices_type_idx" ON "sale_invoices"("type");

-- CreateIndex
CREATE INDEX "sale_invoices_paymentStatus_idx" ON "sale_invoices"("paymentStatus");

-- CreateIndex
CREATE INDEX "sale_invoices_invoiceDate_idx" ON "sale_invoices"("invoiceDate");

-- CreateIndex
CREATE INDEX "sale_invoices_reference_idx" ON "sale_invoices"("reference");

-- CreateIndex
CREATE INDEX "sale_invoice_items_saleInvoiceId_idx" ON "sale_invoice_items"("saleInvoiceId");

-- CreateIndex
CREATE INDEX "sale_invoice_items_finishedProductId_idx" ON "sale_invoice_items"("finishedProductId");

-- CreateIndex
CREATE INDEX "sale_invoice_items_finishedLotId_idx" ON "sale_invoice_items"("finishedLotId");

-- CreateIndex
CREATE INDEX "finished_product_price_history_finishedProductId_idx" ON "finished_product_price_history"("finishedProductId");

-- CreateIndex
CREATE INDEX "finished_product_price_history_recordedAt_idx" ON "finished_product_price_history"("recordedAt");

-- CreateIndex
CREATE INDEX "customer_payments_saleInvoiceId_idx" ON "customer_payments"("saleInvoiceId");

-- CreateIndex
CREATE INDEX "customer_payments_accountId_idx" ON "customer_payments"("accountId");

-- CreateIndex
CREATE INDEX "customer_payments_paymentDate_idx" ON "customer_payments"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");

-- CreateIndex
CREATE INDEX "expenses_accountId_idx" ON "expenses"("accountId");

-- CreateIndex
CREATE INDEX "expenses_activity_idx" ON "expenses"("activity");

-- CreateIndex
CREATE INDEX "expenses_expenseDate_idx" ON "expenses"("expenseDate");

-- CreateIndex
CREATE INDEX "expenses_status_idx" ON "expenses"("status");

-- CreateIndex
CREATE INDEX "expenses_isRecurring_idx" ON "expenses"("isRecurring");

-- CreateIndex
CREATE UNIQUE INDEX "sequence_counters_prefix_year_key" ON "sequence_counters"("prefix", "year");

-- CreateIndex
CREATE INDEX "accounts_type_idx" ON "accounts"("type");

-- CreateIndex
CREATE INDEX "accounts_isActive_idx" ON "accounts"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_name_key" ON "accounts"("name");

-- CreateIndex
CREATE INDEX "treasury_entries_accountId_idx" ON "treasury_entries"("accountId");

-- CreateIndex
CREATE INDEX "treasury_entries_entryDate_idx" ON "treasury_entries"("entryDate");

-- CreateIndex
CREATE INDEX "treasury_entries_source_idx" ON "treasury_entries"("source");

-- CreateIndex
CREATE UNIQUE INDEX "account_transfers_reference_key" ON "account_transfers"("reference");

-- CreateIndex
CREATE INDEX "account_transfers_fromAccountId_idx" ON "account_transfers"("fromAccountId");

-- CreateIndex
CREATE INDEX "account_transfers_toAccountId_idx" ON "account_transfers"("toAccountId");

-- CreateIndex
CREATE INDEX "account_transfers_transferDate_idx" ON "account_transfers"("transferDate");

-- CreateIndex
CREATE UNIQUE INDEX "loans_reference_key" ON "loans"("reference");

-- CreateIndex
CREATE INDEX "loans_status_idx" ON "loans"("status");

-- CreateIndex
CREATE INDEX "loans_startDate_idx" ON "loans"("startDate");

-- CreateIndex
CREATE INDEX "loans_reference_idx" ON "loans"("reference");

-- CreateIndex
CREATE INDEX "loan_schedule_items_loanId_idx" ON "loan_schedule_items"("loanId");

-- CreateIndex
CREATE INDEX "loan_schedule_items_dueDate_idx" ON "loan_schedule_items"("dueDate");

-- CreateIndex
CREATE INDEX "loan_schedule_items_status_idx" ON "loan_schedule_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "loan_schedule_items_loanId_installmentNo_key" ON "loan_schedule_items"("loanId", "installmentNo");

-- CreateIndex
CREATE INDEX "loan_payments_loanId_idx" ON "loan_payments"("loanId");

-- CreateIndex
CREATE INDEX "loan_payments_accountId_idx" ON "loan_payments"("accountId");

-- CreateIndex
CREATE INDEX "loan_payments_paymentDate_idx" ON "loan_payments"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_reference_key" ON "fixed_assets"("reference");

-- CreateIndex
CREATE INDEX "fixed_assets_category_idx" ON "fixed_assets"("category");

-- CreateIndex
CREATE INDEX "fixed_assets_status_idx" ON "fixed_assets"("status");

-- CreateIndex
CREATE INDEX "fixed_assets_acquisitionDate_idx" ON "fixed_assets"("acquisitionDate");

-- CreateIndex
CREATE INDEX "depreciation_entries_fixedAssetId_idx" ON "depreciation_entries"("fixedAssetId");

-- CreateIndex
CREATE INDEX "depreciation_entries_periodYear_periodMonth_idx" ON "depreciation_entries"("periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "depreciation_entries_fixedAssetId_periodYear_periodMonth_key" ON "depreciation_entries"("fixedAssetId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "capital_movements_reference_key" ON "capital_movements"("reference");

-- CreateIndex
CREATE INDEX "capital_movements_type_idx" ON "capital_movements"("type");

-- CreateIndex
CREATE INDEX "capital_movements_accountId_idx" ON "capital_movements"("accountId");

-- CreateIndex
CREATE INDEX "capital_movements_movementDate_idx" ON "capital_movements"("movementDate");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_lots" ADD CONSTRAINT "raw_material_lots_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_lots" ADD CONSTRAINT "raw_material_lots_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_lots" ADD CONSTRAINT "raw_material_lots_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_stock_movements" ADD CONSTRAINT "raw_stock_movements_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_stock_movements" ADD CONSTRAINT "raw_stock_movements_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "raw_material_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_stock_movements" ADD CONSTRAINT "raw_stock_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conservation_costs" ADD CONSTRAINT "conservation_costs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formula_items" ADD CONSTRAINT "formula_items_formulaId_fkey" FOREIGN KEY ("formulaId") REFERENCES "formulas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formula_items" ADD CONSTRAINT "formula_items_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_formulaId_fkey" FOREIGN KEY ("formulaId") REFERENCES "formulas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_product_lots" ADD CONSTRAINT "finished_product_lots_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_product_lots" ADD CONSTRAINT "finished_product_lots_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_product_lots" ADD CONSTRAINT "finished_product_lots_breedingBatchId_fkey" FOREIGN KEY ("breedingBatchId") REFERENCES "breeding_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_stock_movements" ADD CONSTRAINT "finished_stock_movements_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_stock_movements" ADD CONSTRAINT "finished_stock_movements_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "finished_product_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_stock_movements" ADD CONSTRAINT "finished_stock_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_batches" ADD CONSTRAINT "breeding_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_weighings" ADD CONSTRAINT "breeding_weighings_breedingBatchId_fkey" FOREIGN KEY ("breedingBatchId") REFERENCES "breeding_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_weighings" ADD CONSTRAINT "breeding_weighings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_vaccinations" ADD CONSTRAINT "breeding_vaccinations_breedingBatchId_fkey" FOREIGN KEY ("breedingBatchId") REFERENCES "breeding_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_vaccinations" ADD CONSTRAINT "breeding_vaccinations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_feeding_phases" ADD CONSTRAINT "breeding_feeding_phases_breedingBatchId_fkey" FOREIGN KEY ("breedingBatchId") REFERENCES "breeding_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_feeding_phases" ADD CONSTRAINT "breeding_feeding_phases_feedFinishedProductId_fkey" FOREIGN KEY ("feedFinishedProductId") REFERENCES "finished_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_records" ADD CONSTRAINT "breeding_records_breedingBatchId_fkey" FOREIGN KEY ("breedingBatchId") REFERENCES "breeding_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_records" ADD CONSTRAINT "breeding_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_order_items" ADD CONSTRAINT "customer_order_items_customerOrderId_fkey" FOREIGN KEY ("customerOrderId") REFERENCES "customer_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_order_items" ADD CONSTRAINT "customer_order_items_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoices" ADD CONSTRAINT "sale_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoices" ADD CONSTRAINT "sale_invoices_customerOrderId_fkey" FOREIGN KEY ("customerOrderId") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoices" ADD CONSTRAINT "sale_invoices_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES "sale_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoices" ADD CONSTRAINT "sale_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoice_items" ADD CONSTRAINT "sale_invoice_items_saleInvoiceId_fkey" FOREIGN KEY ("saleInvoiceId") REFERENCES "sale_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoice_items" ADD CONSTRAINT "sale_invoice_items_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoice_items" ADD CONSTRAINT "sale_invoice_items_finishedLotId_fkey" FOREIGN KEY ("finishedLotId") REFERENCES "finished_product_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_product_price_history" ADD CONSTRAINT "finished_product_price_history_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_saleInvoiceId_fkey" FOREIGN KEY ("saleInvoiceId") REFERENCES "sale_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_parentRecurringId_fkey" FOREIGN KEY ("parentRecurringId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entries" ADD CONSTRAINT "treasury_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entries" ADD CONSTRAINT "treasury_entries_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entries" ADD CONSTRAINT "treasury_entries_customerPaymentId_fkey" FOREIGN KEY ("customerPaymentId") REFERENCES "customer_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entries" ADD CONSTRAINT "treasury_entries_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entries" ADD CONSTRAINT "treasury_entries_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entries" ADD CONSTRAINT "treasury_entries_loanPaymentId_fkey" FOREIGN KEY ("loanPaymentId") REFERENCES "loan_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entries" ADD CONSTRAINT "treasury_entries_accountTransferId_fkey" FOREIGN KEY ("accountTransferId") REFERENCES "account_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entries" ADD CONSTRAINT "treasury_entries_capitalMovementId_fkey" FOREIGN KEY ("capitalMovementId") REFERENCES "capital_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entries" ADD CONSTRAINT "treasury_entries_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entries" ADD CONSTRAINT "treasury_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_disbursementAccountId_fkey" FOREIGN KEY ("disbursementAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_schedule_items" ADD CONSTRAINT "loan_schedule_items_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_movements" ADD CONSTRAINT "capital_movements_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_movements" ADD CONSTRAINT "capital_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

