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
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { CancelPurchaseOrderDto } from './dto/cancel-purchase-order.dto';
import { QueryPurchaseOrdersDto } from './dto/query-purchase-orders.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Purchase Orders')
@ApiBearerAuth('JWT-auth')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Post()
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Créer un bon de commande avec ses lignes' })
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Liste paginée des bons de commande' })
  findAll(@Query() query: QueryPurchaseOrdersDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: "Détail d'un bon de commande (commandé vs livré)" })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Modifier un bon de commande (DRAFT uniquement)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(':id/validate')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Valider un bon de commande (DRAFT → VALIDATED)' })
  validate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.validate(id);
  }

  @Patch(':id/invalidate')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Invalider un bon de commande validé non réceptionné (VALIDATED → DRAFT)' })
  invalidate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.invalidate(id);
  }

  @Patch(':id/reactivate')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Remettre en circuit un bon de commande annulé (CANCELLED → DRAFT)' })
  reactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.reactivate(id);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Annuler un bon de commande (motif obligatoire)' })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelPurchaseOrderDto,
  ) {
    return this.service.cancel(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Supprimer un bon de commande non validé et non réceptionné' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
