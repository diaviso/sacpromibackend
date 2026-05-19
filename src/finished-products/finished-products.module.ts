import { Module } from '@nestjs/common';
import { FinishedProductsService } from './finished-products.service';
import { FinishedProductsController } from './finished-products.controller';

@Module({
  controllers: [FinishedProductsController],
  providers: [FinishedProductsService],
  exports: [FinishedProductsService],
})
export class FinishedProductsModule {}
