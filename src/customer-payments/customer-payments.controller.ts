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
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { SalePaymentMethod, UserRole } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { CustomerPaymentsService } from './customer-payments.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

class CreateCustomerPaymentDto {
  @ApiProperty({ description: 'ID de la facture de vente' })
  @IsUUID()
  saleInvoiceId!: string;

  @ApiProperty({ example: 25000 })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  paymentDate!: string;

  @ApiProperty({ enum: SalePaymentMethod })
  @IsEnum(SalePaymentMethod)
  paymentMethod!: SalePaymentMethod;

  @ApiPropertyOptional({
    description:
      'ID du compte qui reçoit l\'encaissement (caisse, banque, mobile money). Optionnel pour les paiements CREDIT.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class QueryCustomerPaymentsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  saleInvoiceId?: string;

  @ApiPropertyOptional({ enum: SalePaymentMethod })
  @IsOptional()
  @IsEnum(SalePaymentMethod)
  paymentMethod?: SalePaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

@ApiTags('Customer Payments')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR, UserRole.SALES_MANAGER)
@Controller('customer-payments')
export class CustomerPaymentsController {
  constructor(private readonly service: CustomerPaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Enregistrer un paiement client (recalcul auto du statut facture)' })
  create(
    @Body() dto: CreateCustomerPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Liste paginée des paiements clients' })
  findAll(@Query() query: QueryCustomerPaymentsDto) {
    return this.service.findAll(query, query);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un paiement client" })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({
    summary: 'Supprimer un paiement client',
    description:
      "Réajuste automatiquement le solde de la facture liée et supprime l'écriture de trésorerie. Réservé au DIRECTOR.",
  })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
