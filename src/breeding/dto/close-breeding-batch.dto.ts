import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CloseBreedingBatchDto {
  @ApiProperty({ example: 950, description: 'Nombre final de sujets vivants confirmé' })
  @IsInt()
  @Min(0)
  finalCount!: number;

  @ApiProperty({ example: 2.1, description: 'Poids moyen final (kg)' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  finalAverageWeight!: number;

  @ApiPropertyOptional({ example: 800, description: 'Nombre de poulets vivants pour vente' })
  @IsOptional()
  @IsInt()
  @Min(0)
  liveForSale?: number;

  @ApiPropertyOptional({ example: 150, description: 'Nombre de poulets à abattre' })
  @IsOptional()
  @IsInt()
  @Min(0)
  toSlaughter?: number;

  @ApiPropertyOptional({ example: 25000, description: 'Coût d\'abattage (FCFA)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  slaughterCost?: number;

  @ApiPropertyOptional({ description: 'Date de clôture (défaut : aujourd\'hui)' })
  @IsOptional()
  @IsDateString()
  closeDate?: string;
}
