import { Module } from '@nestjs/common';
import { BreedingService } from './breeding.service';
import { BreedingController } from './breeding.controller';
import { BreedingZootechnicalService } from './breeding-zootechnical.service';
import { BreedingZootechnicalController } from './breeding-zootechnical.controller';

@Module({
  // BreedingZootechnicalController EN PREMIER : il déclare la route statique
  // `GET /breeding/comparison`. BreedingController déclare `GET /breeding/:id`
  // (ParseUUIDPipe). Express matchant par ordre d'enregistrement, si le param
  // `:id` est enregistré avant, `/breeding/comparison` est capté par `:id` et
  // rejeté en 400. L'ordre ci-dessous garantit que les routes statiques du
  // contrôleur zootechnique priment. (Aucune route `:id` nue côté zootechnique.)
  controllers: [BreedingZootechnicalController, BreedingController],
  providers: [BreedingService, BreedingZootechnicalService],
  exports: [BreedingService],
})
export class BreedingModule {}
