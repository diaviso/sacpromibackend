import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { VaccinationRoute } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVaccinationDto {
  @ApiProperty({ example: 'Newcastle (HB1)' })
  @IsString()
  @MaxLength(120)
  vaccineName!: string;

  @ApiProperty({ example: 7, description: 'Jour d\'âge prévu' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  targetAgeDays!: number;

  @ApiProperty({ enum: VaccinationRoute, example: VaccinationRoute.EYE_DROP })
  @IsEnum(VaccinationRoute)
  route!: VaccinationRoute;

  @ApiPropertyOptional({ example: '0,1 mL par poussin' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  dose?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  batchNumber?: string;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;
}

export class MarkVaccinationDoneDto {
  @ApiProperty({ example: '2026-05-19' })
  @IsDateString()
  actualDate!: string;

  @ApiPropertyOptional({ example: 5000, description: 'Coût réel (si différent)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  batchNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;
}

export class SkipVaccinationDto {
  @ApiProperty({ example: 'Vaccin non disponible chez le fournisseur' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}
