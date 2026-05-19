import { Global, Module } from '@nestjs/common';
import { FinishedStockService } from './finished-stock.service';

@Global()
@Module({
  providers: [FinishedStockService],
  exports: [FinishedStockService],
})
export class FinishedStockModule {}
