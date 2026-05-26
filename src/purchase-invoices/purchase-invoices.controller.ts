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
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { QueryPurchaseInvoicesDto } from './dto/query-purchase-invoices.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

class CancelPurchaseInvoiceDto {
  @ApiProperty({ description: "Motif d'annulation (minimum 3 caractères)" })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

@ApiTags('Purchase Invoices')
@ApiBearerAuth('JWT-auth')
@Controller('purchase-invoices')
export class PurchaseInvoicesController {
  constructor(private readonly service: PurchaseInvoicesService) {}

  @Post()
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({
    summary: "Créer une facture d'achat avec ses lignes",
    description:
      "À la création, les quantités livrées du bon de commande lié sont automatiquement mises à jour.",
  })
  create(
    @Body() dto: CreatePurchaseInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: "Liste paginée des factures d'achat" })
  findAll(@Query() query: QueryPurchaseInvoicesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: "Détail d'une facture d'achat avec lignes et paiements" })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({
    summary: "Annuler une facture d'achat (soft-delete)",
    description:
      "Marque la facture annulée + invalide les lots créés (s'ils n'ont pas été consommés). " +
      "Refusé si paiements liés ou lots déjà entamés. Réservé au DIRECTOR.",
  })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelPurchaseInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.cancel(id, dto.reason, user.id);
  }
}
