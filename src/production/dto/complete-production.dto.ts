import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CompleteProductionDto {
  @ApiProperty({ example: 5, description: 'Quantité réellement produite (en unités de production)' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  producedQuantity!: number;

  @ApiProperty({ example: 35000, description: 'Coût de transformation (FCFA) — main d’œuvre + énergie' })
  @IsInt()
  @Min(0)
  transformationCost!: number;

  @ApiPropertyOptional({ example: '2026-08-30', description: 'Date de péremption du lot produit' })
  @IsOptional()
  @IsDateString()
  expirationDate?: string;
}
