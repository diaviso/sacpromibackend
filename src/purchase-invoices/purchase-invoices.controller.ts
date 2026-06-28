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
import { UpdatePurchaseInvoiceDto } from './dto/update-purchase-invoice.dto';
import { QueryPurchaseInvoicesDto } from './dto/query-purchase-invoices.dto';
import { QuickPurchaseDto } from './dto/quick-purchase.dto';
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
    summary: "Enregistrer une reception (facture d'achat) liee ou non a un BC",
    description:
      "A la creation : les lots stock sont generes, le PMP est recalcule, et les quantites livrees du BC lie (si fourni) sont automatiquement incrementees.",
  })
  create(
    @Body() dto: CreatePurchaseInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user.id);
  }

  @Post('quick-purchase')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({
    summary: 'Achat comptoir : creer + valider un BC, le receptionner et l\'encaisser',
    description:
      'Mode POS achats : tout se fait en une transaction. Le BC est cree directement en statut VALIDATED, ' +
      'la facture immediatement receptionnee (lots stock crees, PMP recalcule), et si paidAmount > 0 ' +
      'un SupplierPayment + ecriture tresorerie sont enregistres atomiquement. Reserve aux achats au comptoir.',
  })
  quickPurchase(
    @Body() dto: QuickPurchaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.quickPurchase(dto, user.id);
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

  @Patch(':id')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({
    summary: "Modifier les champs ADMIN d'une facture (n° fournisseur, dates, scan)",
    description:
      "Les lignes (quantités, prix, matières) ne sont PAS modifiables après création — les lots et le PMP sont déjà appliqués. " +
      "Pour corriger les lignes, annulez la facture (DIRECTOR) et resaisissez-en une nouvelle.",
  })
  updateAdmin(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePurchaseInvoiceDto,
  ) {
    return this.service.updateAdmin(id, dto);
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
