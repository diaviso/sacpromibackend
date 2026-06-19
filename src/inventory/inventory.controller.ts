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
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InventoryType, UserRole } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { InventoryService } from './inventory.service';
import { CreateRawInventoryDto } from './dto/create-inventory.dto';
import { CancelInventoryDto, UpdateInventoryDto } from './dto/update-inventory.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

class QueryInventoryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: InventoryType })
  @IsOptional()
  @IsEnum(InventoryType)
  type?: InventoryType;
}

@ApiTags('Inventory')
@ApiBearerAuth('JWT-auth')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Post('raw-materials')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({
    summary: 'Lancer un inventaire matières premières',
    description:
      'Le système pré-remplit chaque ligne avec le stock théorique courant. Utilisez ensuite PATCH pour saisir les stocks réels.',
  })
  createRawInventory(
    @Body() dto: CreateRawInventoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createForRawMaterials(dto, user.id);
  }

  @Post('finished-products')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.SALES_MANAGER, UserRole.OPERATOR)
  @ApiOperation({
    summary: 'Lancer un inventaire produits finis',
    description: 'Pré-remplit chaque ligne avec le stock théorique courant des produits finis actifs.',
  })
  createFinishedInventory(
    @Body() dto: CreateRawInventoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createForFinishedProducts(dto, user.id);
  }

  @Get()
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.SALES_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Liste paginée des inventaires (filtre par type)' })
  findAll(@Query() query: QueryInventoryDto) {
    return this.service.findAll(query, query.type);
  }

  @Get(':id')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: "Détail d'un inventaire avec lignes (théorique vs réel + écarts)" })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Saisir les stocks réels (calcul automatique des écarts)' })
  updateActuals(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInventoryDto,
  ) {
    return this.service.updateActuals(id, dto);
  }

  @Patch(':id/validate')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({
    summary: "Valider un inventaire (génère les ajustements de stock + signale les écarts > 5%)",
  })
  validate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.validate(id, user.id);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({
    summary: "Annuler un inventaire non validé (motif obligatoire, conservation pour audit)",
  })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelInventoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.cancel(id, dto.reason, user.id);
  }

  @Delete(':id')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({
    summary: "Supprimer définitivement un inventaire non validé (DIRECTOR uniquement)",
  })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
