import { Module } from '@nestjs/common';
import { CapitalMovementsController } from './capital-movements.controller';
import { CapitalMovementsService } from './capital-movements.service';
import { TreasuryModule } from '../treasury/treasury.module';

@Module({
  imports: [TreasuryModule],
  controllers: [CapitalMovementsController],
  providers: [CapitalMovementsService],
  exports: [CapitalMovementsService],
})
export class CapitalMovementsModule {}
