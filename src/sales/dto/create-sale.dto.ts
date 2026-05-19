import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SaleInvoiceType, SalePaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSaleItemDto {
  @ApiProperty({ description: 'ID du produit fini' })
  @IsUUID()
  finishedProductId!: string;

  @ApiProperty({ example: 50 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Prix unitaire négocié (sinon prix gros/détail du client)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPrice?: number;
}

export class CreateSaleDto {
  @ApiProperty({ enum: SaleInvoiceType, description: 'Facture (gros) ou Reçu (détail)' })
  @IsEnum(SaleInvoiceType)
  type!: SaleInvoiceType;

  @ApiProperty({ description: 'ID du client (utilisez le client comptoir pour les ventes anonymes détail)' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ description: 'ID de la commande source' })
  @IsOptional()
  @IsUUID()
  customerOrderId?: string;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  invoiceDate!: string;

  @ApiProperty({ enum: SalePaymentMethod })
  @IsEnum(SalePaymentMethod)
  paymentMethod!: SalePaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ type: [CreateSaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
}
