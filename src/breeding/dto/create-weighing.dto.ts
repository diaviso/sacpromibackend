import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWeighingDto {
  @ApiProperty({ example: '2026-05-20' })
  @IsDateString()
  weighingDate!: string;

  @ApiProperty({ example: 30, description: 'Nombre de poulets pesés' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sampleSize!: number;

  @ApiProperty({ example: 1450, description: 'Poids moyen calculé (grammes)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  averageWeightGrams!: number;

  @ApiPropertyOptional({ example: 1280 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minWeightGrams?: number;

  @ApiPropertyOptional({ example: 1620 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxWeightGrams?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;
}
