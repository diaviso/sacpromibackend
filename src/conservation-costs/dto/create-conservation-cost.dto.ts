import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateConservationCostDto {
  @ApiProperty({ example: '2026-04-01', description: 'Début de période (inclus)' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-04-30', description: 'Fin de période (inclus)' })
  @IsDateString()
  periodEnd!: string;

  @ApiProperty({
    example: 75000,
    description: 'Montant total en FCFA (stockage + manutention pour cette période)',
  })
  @IsInt()
  @Min(0)
  totalAmount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
