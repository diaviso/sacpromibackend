import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseInvoiceItemDto {
  @ApiProperty({ description: 'ID de la matière première reçue' })
  @IsUUID()
  rawMaterialId!: string;

  @ApiProperty({ example: 'Maïs jaune', description: 'Snapshot du nom au moment de la réception' })
  @IsString()
  @MaxLength(150)
  itemName!: string;

  @ApiProperty({ example: 1000 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ example: 'kg' })
  @IsString()
  @MaxLength(20)
  unit!: string;

  @ApiProperty({ example: 250 })
  @IsInt()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Frais de transport pour cette ligne (FCFA, optionnel)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  transportCost?: number;

  @ApiPropertyOptional({ example: 'LOT-2026-001', description: 'Numéro de lot (auto-généré si absent)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lotNumber?: string;

  @ApiPropertyOptional({ example: '2027-04-30' })
  @IsOptional()
  @IsDateString()
  expirationDate?: string;
}

export class CreatePurchaseInvoiceDto {
  @ApiProperty({ description: 'Numéro de facture côté fournisseur' })
  @IsString()
  @MaxLength(50)
  supplierInvoiceNumber!: string;

  @ApiProperty({ description: 'ID du fournisseur' })
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional({ description: 'ID du bon de commande lié (optionnel)' })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  invoiceDate!: string;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  receptionDate!: string;

  @ApiPropertyOptional({ description: 'URL du scan/photo de la facture' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  scanUrl?: string;

  @ApiProperty({ type: [CreatePurchaseInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseInvoiceItemDto)
  items!: CreatePurchaseInvoiceItemDto[];
}
