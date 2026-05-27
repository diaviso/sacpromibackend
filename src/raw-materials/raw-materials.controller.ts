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
import { RawMaterialsService } from './raw-materials.service';
import { CreateRawMaterialDto } from './dto/create-raw-material.dto';
import { UpdateRawMaterialDto } from './dto/update-raw-material.dto';
import { QueryRawMaterialsDto } from './dto/query-raw-materials.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { DeclareLossDto } from './dto/declare-loss.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Raw Materials')
@ApiBearerAuth('JWT-auth')
@Controller('raw-materials')
export class RawMaterialsController {
  constructor(private readonly service: RawMaterialsService) {}

  @Post()
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Créer une matière première' })
  create(@Body() dto: CreateRawMaterialDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(
    UserRole.DIRECTOR,
    UserRole.PRODUCTION_MANAGER,
    UserRole.OPERATOR,
    UserRole.BREEDING_MANAGER,
    UserRole.SALES_MANAGER,
  )
  @ApiOperation({ summary: 'Liste paginée des matières premières' })
  findAll(@Query() query: QueryRawMaterialsDto) {
    return this.service.findAll(query);
  }

  @Get('low-stock')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: "Matières en dessous du seuil d'alerte" })
  lowStock() {
    return this.service.getLowStock();
  }

  @Get('movements')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({
    summary: 'Historique global des mouvements de stock MP (toutes matières)',
    description:
      "Vue d'audit consolidée : filtres par matière, type, période, utilisateur. " +
      "Permet de retracer 'qui a fait quoi quand' sur le stock.",
  })
  allMovements(@Query() query: QueryMovementsDto & { rawMaterialId?: string; createdById?: string }) {
    return this.service.getAllMovements(query);
  }

  @Get('expiring')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Lots dont la péremption est dans moins de 7 jours' })
  expiring() {
    return this.service.getExpiring(7);
  }

  @Get(':id')
  @Roles(
    UserRole.DIRECTOR,
    UserRole.PRODUCTION_MANAGER,
    UserRole.OPERATOR,
    UserRole.BREEDING_MANAGER,
    UserRole.SALES_MANAGER,
  )
  @ApiOperation({ summary: 'Fiche complète : stock, lots actifs, prix moyen, 10 derniers achats' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/lots')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: "Tous les lots d'une matière (avec statut)" })
  getLots(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getLots(id);
  }

  @Get(':id/movements')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Historique des mouvements de stock' })
  getMovements(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: QueryMovementsDto,
  ) {
    return this.service.getMovements(id, query);
  }

  @Patch(':id')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Modifier une matière première' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRawMaterialDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/loss')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({
    summary: 'Déclarer une perte/casse sur une matière première',
    description:
      'Crée un mouvement LOSS qui décrémente le stock en FIFO. Le motif est obligatoire et tracé.',
  })
  declareLoss(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DeclareLossDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.declareLoss(id, dto, user.id);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Désactiver une matière' })
  deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.deactivate(id);
  }

  @Patch(':id/activate')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Réactiver une matière' })
  activate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.activate(id);
  }

  @Delete(':id')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Supprimer une matière (uniquement si aucun lot lié)' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
