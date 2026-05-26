import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
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

export const SUPPLIER_PAYMENT_SORT_FIELDS = ['paymentDate', 'amount'] as const;
export type SupplierPaymentSortField = (typeof SUPPLIER_PAYMENT_SORT_FIELDS)[number];

export class QuerySupplierPaymentsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'ID fournisseur (filtre indirect via facture)' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'ID facture' })
  @IsOptional()
  @IsUUID()
  purchaseInvoiceId?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Recherche : référence facture, n° facture fournisseur, fournisseur ou note',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: SUPPLIER_PAYMENT_SORT_FIELDS, default: 'paymentDate' })
  @IsOptional()
  @IsIn(SUPPLIER_PAYMENT_SORT_FIELDS as unknown as string[])
  sortBy?: SupplierPaymentSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
