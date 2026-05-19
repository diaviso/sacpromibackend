import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateFormulaItemDto {
  @ApiProperty({ description: 'ID de la matière première' })
  @IsUUID()
  rawMaterialId!: string;

  @ApiProperty({ example: 550, description: 'Quantité par unité de production' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;
}

export class CreateFormulaDto {
  @ApiProperty({ description: 'ID du produit fini' })
  @IsUUID()
  finishedProductId!: string;

  @ApiProperty({ example: 'Aliment poulet chair croissance v1' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: '1 tonne', description: 'Unité de production (texte libre)' })
  @IsString()
  @MaxLength(50)
  productionUnit!: string;

  @ApiProperty({ example: 1000, description: 'Poids de l’unité en kg (pour calculs)' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  unitWeightKg!: number;

  @ApiPropertyOptional({ example: true, description: 'Activer cette formule (désactive les autres)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  technicalNote?: string;

  @ApiProperty({ type: [CreateFormulaItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateFormulaItemDto)
  items!: CreateFormulaItemDto[];
}
