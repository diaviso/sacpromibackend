import { Module } from '@nestjs/common';
import { CustomerPaymentsService } from './customer-payments.service';
import { CustomerPaymentsController } from './customer-payments.controller';
import { TreasuryModule } from '../treasury/treasury.module';

@Module({
  imports: [TreasuryModule],
  controllers: [CustomerPaymentsController],
  providers: [CustomerPaymentsService],
  exports: [CustomerPaymentsService],
})
export class CustomerPaymentsModule {}
