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
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseOrderItemDto {
  @ApiProperty({ description: 'ID de la matiere premiere commandee' })
  @IsUUID()
  rawMaterialId!: string;

  @ApiProperty({ example: 'Mais jaune' })
  @IsString()
  @MaxLength(150)
  itemName!: string;

  @ApiProperty({ example: 'kg' })
  @IsString()
  @MaxLength(20)
  unit!: string;

  @ApiProperty({ example: 1000, description: 'Quantite commandee' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantityOrdered!: number;

  @ApiProperty({ example: 250, description: 'Prix unitaire estime (FCFA, entier)' })
  @IsInt()
  @Min(0)
  unitPriceEstimate!: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: 'ID du fournisseur' })
  @IsUUID()
  supplierId!: string;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  orderDate!: string;

  @ApiPropertyOptional({ example: '2026-05-05' })
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ type: [CreatePurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Au moins une ligne est obligatoire' })
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items!: CreatePurchaseOrderItemDto[];
}
