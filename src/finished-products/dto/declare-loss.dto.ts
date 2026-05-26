import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class DeclareLossDto {
  @ApiProperty({ example: 5, description: "Quantité perdue (dans l'unité du produit)" })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({
    description: "Motif obligatoire (ex: sac déchiré, casse, mortalité post-clôture, péremption)",
    minLength: 3,
    maxLength: 500,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
