import { Global, Module } from '@nestjs/common';
import { RawStockService } from './raw-stock.service';

@Global()
@Module({
  providers: [RawStockService],
  exports: [RawStockService],
})
export class RawStockModule {}
