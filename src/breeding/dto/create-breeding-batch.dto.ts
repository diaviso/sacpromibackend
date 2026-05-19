import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateBreedingBatchDto {
  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: 'Cobb 500' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  strain!: string;

  @ApiProperty({ example: 1000 })
  @IsInt()
  @Min(1)
  initialCount!: number;

  @ApiProperty({ example: 'Coopérative Avicole Thiès' })
  @IsString()
  @MaxLength(150)
  chickSupplier!: string;

  @ApiProperty({ example: 350000, description: 'Coût total achat poussins (FCFA)' })
  @IsInt()
  @Min(0)
  chicksCost!: number;

  @ApiPropertyOptional({ description: 'Charges fixes affectées (FCFA)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  fixedCharges?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
