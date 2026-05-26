import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SupplierPaymentsService } from './supplier-payments.service';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { QuerySupplierPaymentsDto } from './dto/query-supplier-payments.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Supplier Payments')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR)
@Controller('supplier-payments')
export class SupplierPaymentsController {
  constructor(private readonly service: SupplierPaymentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Enregistrer un paiement fournisseur',
    description:
      'Le statut de paiement de la facture est recalculé : PAID si solde nul, PARTIALLY_PAID sinon.',
  })
  create(
    @Body() dto: CreateSupplierPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Historique global des paiements fournisseurs' })
  findAll(@Query() query: QuerySupplierPaymentsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un paiement fournisseur" })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Supprimer un paiement fournisseur',
    description:
      "Réajuste automatiquement le solde de la facture liée et supprime l'écriture de trésorerie associée.",
  })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
