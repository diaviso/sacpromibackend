import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PaymentStatus, SaleInvoiceType, SalePaymentMethod, UserRole } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { SalesService } from './sales.service';
import { SalePdfService } from './sale-pdf.service';
import { SaleEmailService } from './sale-email.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

class QuerySalesDto extends PaginationDto {
  @ApiPropertyOptional({ enum: SaleInvoiceType })
  @IsOptional()
  @IsEnum(SaleInvoiceType)
  type?: SaleInvoiceType;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ enum: SalePaymentMethod })
  @IsOptional()
  @IsEnum(SalePaymentMethod)
  paymentMethod?: SalePaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

@ApiTags('Sales')
@ApiBearerAuth('JWT-auth')
@Controller('sales')
export class SalesController {
  constructor(
    private readonly service: SalesService,
    private readonly pdfService: SalePdfService,
    private readonly emailService: SaleEmailService,
  ) {}

  @Post()
  @Roles(UserRole.DIRECTOR, UserRole.SALES_MANAGER, UserRole.OPERATOR)
  @ApiOperation({
    summary: 'Créer une facture de vente / reçu',
    description:
      'Vérifie le stock, ponctionne en FIFO, vérifie le plafond crédit (warning), met à jour la commande liée — tout en transaction.',
  })
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @Roles(UserRole.DIRECTOR, UserRole.SALES_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Liste paginée des ventes' })
  findAll(@Query() query: QuerySalesDto) {
    return this.service.findAll(query, query);
  }

  @Get(':id')
  @Roles(UserRole.DIRECTOR, UserRole.SALES_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Détail facture / reçu' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/pdf')
  @Roles(UserRole.DIRECTOR, UserRole.SALES_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Générer le PDF de la facture' })
  async getPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const invoice = await this.service.findOne(id);
    const pdfBuffer = await this.pdfService.generateSaleInvoicePdf(invoice);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.reference}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.end(pdfBuffer);
  }

  @Post(':id/send-email')
  @Roles(UserRole.DIRECTOR, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Envoyer la facture PDF par email au client' })
  async sendEmail(@Param('id', new ParseUUIDPipe()) id: string) {
    const invoice = await this.service.findOne(id);
    const pdfBuffer = await this.pdfService.generateSaleInvoicePdf(invoice);
    return this.emailService.sendSaleInvoiceEmail(invoice, pdfBuffer);
  }

  @Post(':id/credit-note')
  @Roles(UserRole.DIRECTOR, UserRole.SALES_MANAGER)
  @ApiOperation({
    summary: 'Créer un avoir (retour marchandise)',
    description: 'Restaure le stock et réduit le montant dû par le client.',
  })
  createCreditNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateCreditNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createCreditNote(id, dto, user.id);
  }
}
