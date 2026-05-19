import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBreedingRecordDto {
  @ApiProperty({ example: '2026-04-15' })
  @IsDateString()
  recordDate!: string;

  @ApiPropertyOptional({ example: 5, description: 'Nombre de morts' })
  @IsOptional()
  @IsInt()
  @Min(0)
  mortality?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  mortalityCause?: string;

  @ApiPropertyOptional({ description: 'ID produit fini distribué (aliment)' })
  @IsOptional()
  @IsUUID()
  feedFinishedProductId?: string;

  @ApiPropertyOptional({ example: 50, description: "Quantité d'aliment distribuée" })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  feedQuantity?: number;

  @ApiPropertyOptional({ example: 1.2, description: 'Poids moyen échantillon (kg)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  averageWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  vetTreatment?: string;

  @ApiPropertyOptional({ description: 'Coût vétérinaire (FCFA)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  vetCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;
}
