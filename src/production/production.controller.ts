import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProductionService } from './production.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { CompleteProductionDto } from './dto/complete-production.dto';
import { CancelProductionDto } from './dto/cancel-production.dto';
import { QueryProductionOrdersDto } from './dto/query-production.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Production')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
@Controller('production')
export class ProductionController {
  constructor(private readonly service: ProductionService) {}

  @Post()
  @ApiOperation({
    summary: 'Créer un ordre de production',
    description:
      "Vérifie la disponibilité matières — retourne `shortages` si insuffisant (warning, pas bloquant).",
  })
  create(
    @Body() dto: CreateProductionOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Liste paginée des ordres de production' })
  findAll(@Query() query: QueryProductionOrdersDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail complet d'un ordre de production" })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Démarrer la production (PLANNED → IN_PROGRESS)' })
  start(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.start(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modifier un ordre de production PLANNED (formule, quantité, dates, note)',
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: import('./dto/update-production-order.dto').UpdateProductionOrderDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(':id/complete')
  @ApiOperation({
    summary: 'Clôturer la production',
    description:
      'Consomme les MP via FIFO, calcule le coût de revient, crée un lot PF, met à jour le stock — tout en transaction.',
  })
  complete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CompleteProductionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.complete(id, dto, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: "Annuler l'ordre (PLANNED ou IN_PROGRESS uniquement)" })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelProductionDto,
  ) {
    return this.service.cancel(id, dto);
  }
}
