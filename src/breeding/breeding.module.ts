import { Module } from '@nestjs/common';
import { BreedingService } from './breeding.service';
import { BreedingController } from './breeding.controller';

@Module({
  controllers: [BreedingController],
  providers: [BreedingService],
  exports: [BreedingService],
})
export class BreedingModule {}
