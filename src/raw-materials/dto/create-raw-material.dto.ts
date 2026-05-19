import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MeasurementUnit, RawMaterialCategory } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRawMaterialDto {
  @ApiProperty({ example: 'MAIS-JAUNE' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'Maïs jaune' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: RawMaterialCategory })
  @IsEnum(RawMaterialCategory)
  category!: RawMaterialCategory;

  @ApiProperty({ enum: MeasurementUnit })
  @IsEnum(MeasurementUnit)
  unit!: MeasurementUnit;

  @ApiPropertyOptional({
    example: 50,
    description: 'Poids en kg pour 1 sac (uniquement si unit = BAG)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  weightPerBag?: number;

  @ApiPropertyOptional({ example: 100, description: 'Seuil d’alerte (quantité)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  alertThreshold?: number;

  @ApiPropertyOptional({ example: 0, description: 'Prix unitaire moyen initial (FCFA)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  averagePrice?: number;
}
