import { Module } from '@nestjs/common';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { PurchaseInvoicesController } from './purchase-invoices.controller';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { TreasuryModule } from '../treasury/treasury.module';

@Module({
  imports: [PurchaseOrdersModule, TreasuryModule],
  controllers: [PurchaseInvoicesController],
  providers: [PurchaseInvoicesService],
  exports: [PurchaseInvoicesService],
})
export class PurchaseInvoicesModule {}
