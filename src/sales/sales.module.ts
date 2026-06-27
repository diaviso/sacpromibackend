import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { SalePdfService } from './sale-pdf.service';
import { SaleEmailService } from './sale-email.service';
import { CustomerOrdersModule } from '../customer-orders/customer-orders.module';
import { TreasuryModule } from '../treasury/treasury.module';

@Module({
  imports: [CustomerOrdersModule, TreasuryModule],
  controllers: [SalesController],
  providers: [SalesService, SalePdfService, SaleEmailService],
  exports: [SalesService],
})
export class SalesModule {}
