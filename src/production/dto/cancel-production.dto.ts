import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelProductionDto {
  @ApiProperty({ description: "Motif d'annulation (obligatoire)" })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
