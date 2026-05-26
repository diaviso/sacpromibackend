import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const PURCHASE_INVOICE_SORT_FIELDS = [
  'invoiceDate',
  'reference',
  'totalAmount',
  'amountRemaining',
  'paymentStatus',
] as const;
export type PurchaseInvoiceSortField = (typeof PURCHASE_INVOICE_SORT_FIELDS)[number];

export class QueryPurchaseInvoicesDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ description: 'ID fournisseur' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Date début (inclus)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Date fin (inclus)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Recherche : référence interne, n° facture fournisseur ou nom du fournisseur',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: PURCHASE_INVOICE_SORT_FIELDS, default: 'invoiceDate' })
  @IsOptional()
  @IsIn(PURCHASE_INVOICE_SORT_FIELDS as unknown as string[])
  sortBy?: PurchaseInvoiceSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
