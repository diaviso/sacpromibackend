import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { FinishedProductsService } from './finished-products.service';
import { CreateFinishedProductDto } from './dto/create-finished-product.dto';
import { UpdateFinishedProductDto } from './dto/update-finished-product.dto';
import { QueryFinishedProductsDto } from './dto/query-finished-products.dto';
import { DeclareLossDto } from './dto/declare-loss.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Finished Products')
@ApiBearerAuth('JWT-auth')
@Controller('finished-products')
export class FinishedProductsController {
  constructor(private readonly service: FinishedProductsService) {}

  @Post()
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Créer un produit fini' })
  create(@Body() dto: CreateFinishedProductDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(
    UserRole.DIRECTOR,
    UserRole.PRODUCTION_MANAGER,
    UserRole.SALES_MANAGER,
    UserRole.BREEDING_MANAGER,
    UserRole.OPERATOR,
  )
  @ApiOperation({ summary: 'Liste paginée des produits finis' })
  findAll(@Query() query: QueryFinishedProductsDto) {
    return this.service.findAll(query);
  }

  @Get('low-stock')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: "Produits sous le seuil d'alerte" })
  lowStock() {
    return this.service.getLowStock();
  }

  @Get('expiring')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Lots PF dont la péremption est proche (< 7 jours)' })
  expiring() {
    return this.service.getExpiring(7);
  }

  @Get(':id')
  @Roles(
    UserRole.DIRECTOR,
    UserRole.PRODUCTION_MANAGER,
    UserRole.SALES_MANAGER,
    UserRole.BREEDING_MANAGER,
  )
  @ApiOperation({ summary: 'Fiche produit fini avec lots actifs et formule active' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/lots')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: "Tous les lots d'un produit fini" })
  getLots(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getLots(id);
  }

  @Get(':id/movements')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Historique des mouvements PF' })
  getMovements(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.service.getMovements(id, page, limit);
  }

  @Patch(':id')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Modifier un produit fini' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFinishedProductDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/loss')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({
    summary: 'Déclarer une perte/casse sur un produit fini',
    description:
      'Crée un mouvement LOSS qui décrémente le stock en FIFO. Motif obligatoire et tracé.',
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
  deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.deactivate(id);
  }

  @Patch(':id/activate')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  activate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.activate(id);
  }

  @Delete(':id')
  @Roles(UserRole.DIRECTOR)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
