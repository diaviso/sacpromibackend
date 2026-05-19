import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductionOrderDto {
  @ApiProperty({ description: 'ID de la formule active à utiliser' })
  @IsUUID()
  formulaId!: string;

  @ApiProperty({ example: 5, description: "Quantité cible en unités de production de la formule (ex : 5 tonnes)" })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  targetQuantity!: number;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  productionDate!: string;

  @ApiPropertyOptional({ example: '2026-08-30' })
  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
