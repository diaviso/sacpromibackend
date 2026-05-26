import { Module } from '@nestjs/common';
import { BreedingService } from './breeding.service';
import { BreedingController } from './breeding.controller';
import { BreedingZootechnicalService } from './breeding-zootechnical.service';
import { BreedingZootechnicalController } from './breeding-zootechnical.controller';

@Module({
  controllers: [BreedingController, BreedingZootechnicalController],
  providers: [BreedingService, BreedingZootechnicalService],
  exports: [BreedingService],
})
export class BreedingModule {}
