import { Module } from '@nestjs/common';
import { SupplierCreditNotesService } from './supplier-credit-notes.service';
import { SupplierCreditNotesController } from './supplier-credit-notes.controller';

@Module({
  controllers: [SupplierCreditNotesController],
  providers: [SupplierCreditNotesService],
  exports: [SupplierCreditNotesService],
})
export class SupplierCreditNotesModule {}
