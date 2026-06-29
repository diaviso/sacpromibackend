-- DropForeignKey
ALTER TABLE "supplier_credit_note_items" DROP CONSTRAINT "supplier_credit_note_items_rawMaterialId_fkey";

-- DropForeignKey
ALTER TABLE "supplier_credit_note_items" DROP CONSTRAINT "supplier_credit_note_items_rawMaterialLotId_fkey";

-- DropForeignKey
ALTER TABLE "supplier_credit_notes" DROP CONSTRAINT "supplier_credit_notes_createdById_fkey";

-- DropForeignKey
ALTER TABLE "supplier_credit_notes" DROP CONSTRAINT "supplier_credit_notes_purchaseInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "supplier_credit_notes" DROP CONSTRAINT "supplier_credit_notes_supplierId_fkey";

-- AlterTable
ALTER TABLE "company_settings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_credit_note_items" ADD CONSTRAINT "supplier_credit_note_items_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_credit_note_items" ADD CONSTRAINT "supplier_credit_note_items_rawMaterialLotId_fkey" FOREIGN KEY ("rawMaterialLotId") REFERENCES "raw_material_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
