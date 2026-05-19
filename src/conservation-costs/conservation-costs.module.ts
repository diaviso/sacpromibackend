import { Module } from '@nestjs/common';
import { ConservationCostsService } from './conservation-costs.service';
import { ConservationCostsController } from './conservation-costs.controller';

@Module({
  controllers: [ConservationCostsController],
  providers: [ConservationCostsService],
  exports: [ConservationCostsService],
})
export class ConservationCostsModule {}
