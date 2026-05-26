import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BreedingZootechnicalService } from './breeding-zootechnical.service';
import { CreateWeighingDto } from './dto/create-weighing.dto';
import {
  CreateVaccinationDto,
  MarkVaccinationDoneDto,
  SkipVaccinationDto,
} from './dto/create-vaccination.dto';
import { SetFeedingPhasesDto } from './dto/feeding-phase.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('Breeding — Zootechnique')
@ApiBearerAuth('JWT-auth')
@Controller('breeding')
export class BreedingZootechnicalController {
  constructor(private readonly service: BreedingZootechnicalService) {}

  // =====================================================
  // PESÉES
  // =====================================================

  @Post(':id/weighings')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Enregistrer une pesée par échantillonnage' })
  addWeighing(
    @Param('id', new ParseUUIDPipe()) batchId: string,
    @Body() dto: CreateWeighingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.addWeighing(batchId, dto, user.id);
  }

  @Get(':id/weighings')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Liste des pesées (ordonnées par date)' })
  getWeighings(@Param('id', new ParseUUIDPipe()) batchId: string) {
    return this.service.getWeighings(batchId);
  }

  @Delete('weighings/:weighingId')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({ summary: 'Supprimer une pesée' })
  deleteWeighing(@Param('weighingId', new ParseUUIDPipe()) id: string) {
    return this.service.deleteWeighing(id);
  }

  // =====================================================
  // VACCINATIONS
  // =====================================================

  @Get(':id/vaccinations')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Liste du programme vaccinal de la bande' })
  getVaccinations(@Param('id', new ParseUUIDPipe()) batchId: string) {
    return this.service.getVaccinations(batchId);
  }

  @Post(':id/vaccinations')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({ summary: 'Programmer une vaccination' })
  addVaccination(
    @Param('id', new ParseUUIDPipe()) batchId: string,
    @Body() dto: CreateVaccinationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.addVaccination(batchId, dto, user.id);
  }

  @Post(':id/vaccinations/apply-default')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({
    summary: 'Appliquer le programme vaccinal par défaut (Cobb 500 / Ross 308)',
    description:
      'Ajoute les vaccinations Newcastle (J1, J14, J21), Gumboro (J10) si elles ne sont pas déjà programmées.',
  })
  applyDefault(
    @Param('id', new ParseUUIDPipe()) batchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.applyDefaultProgram(batchId, user.id);
  }

  @Patch('vaccinations/:vaccinationId/done')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Marquer une vaccination comme effectuée' })
  markDone(
    @Param('vaccinationId', new ParseUUIDPipe()) id: string,
    @Body() dto: MarkVaccinationDoneDto,
  ) {
    return this.service.markVaccinationDone(id, dto);
  }

  @Patch('vaccinations/:vaccinationId/skip')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({ summary: 'Marquer une vaccination comme omise (motif obligatoire)' })
  skip(
    @Param('vaccinationId', new ParseUUIDPipe()) id: string,
    @Body() dto: SkipVaccinationDto,
  ) {
    return this.service.skipVaccination(id, dto);
  }

  @Delete('vaccinations/:vaccinationId')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({ summary: 'Supprimer une vaccination programmée' })
  deleteVaccination(@Param('vaccinationId', new ParseUUIDPipe()) id: string) {
    return this.service.deleteVaccination(id);
  }

  // =====================================================
  // PHASES ALIMENTAIRES
  // =====================================================

  @Get(':id/feeding-phases')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Récupérer les phases alimentaires de la bande' })
  getPhases(@Param('id', new ParseUUIDPipe()) batchId: string) {
    return this.service.getFeedingPhases(batchId);
  }

  @Post(':id/feeding-phases')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({
    summary: 'Définir les phases alimentaires (remplace les phases existantes)',
  })
  setPhases(
    @Param('id', new ParseUUIDPipe()) batchId: string,
    @Body() dto: SetFeedingPhasesDto,
  ) {
    return this.service.setFeedingPhases(batchId, dto);
  }

  @Post(':id/feeding-phases/apply-default')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({
    summary: 'Appliquer les phases alimentaires standard (démarrage / croissance / finition)',
  })
  applyDefaultPhases(@Param('id', new ParseUUIDPipe()) batchId: string) {
    return this.service.applyDefaultFeedingPhases(batchId);
  }

  // =====================================================
  // KPI + PRÉVISIONNEL + COMPARATIF
  // =====================================================

  @Get(':id/kpi')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER, UserRole.OPERATOR)
  @ApiOperation({
    summary: 'Indicateurs zootechniques (IC, GMQ, EPI, viabilité, courbe poids)',
  })
  getKPIs(@Param('id', new ParseUUIDPipe()) batchId: string) {
    return this.service.getZootechnicalKPIs(batchId);
  }

  @Get(':id/forecast')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({
    summary: 'Prévisionnel : date d\'abattage estimée + recette + marge',
  })
  getForecast(@Param('id', new ParseUUIDPipe()) batchId: string) {
    return this.service.getForecast(batchId);
  }

  @Get('comparison')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({ summary: 'Comparer jusqu\'à 5 bandes (paramètre ids séparés par virgules)' })
  comparison(@Query('ids') ids: string) {
    const batchIds = (ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.service.getComparison(batchIds);
  }
}
