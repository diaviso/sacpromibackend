import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
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

export class CreateSupplierPaymentDto {
  @ApiProperty({ description: "ID de la facture d'achat à payer" })
  @IsUUID()
  purchaseInvoiceId!: string;

  @ApiProperty({ example: 50000, description: 'Montant payé en FCFA' })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  paymentDate!: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({
    description: 'ID du compte d\'où sort le paiement (caisse, banque, mobile money)',
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
