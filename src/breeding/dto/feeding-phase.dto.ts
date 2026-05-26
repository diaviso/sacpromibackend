import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FeedingPhase } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class FeedingPhaseItemDto {
  @ApiProperty({ enum: FeedingPhase, example: FeedingPhase.STARTER })
  @IsEnum(FeedingPhase)
  phase!: FeedingPhase;

  @ApiProperty({ example: 0, description: 'Jour de début (inclus)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  startDay!: number;

  @ApiProperty({ example: 10, description: 'Jour de fin (inclus)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  endDay!: number;

  @ApiProperty({ example: 25, description: 'Quantité théorique en g/poulet/jour' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dailyFeedPerHeadGrams!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  feedFinishedProductId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  technicalNote?: string;
}

export class SetFeedingPhasesDto {
  @ApiProperty({ type: [FeedingPhaseItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedingPhaseItemDto)
  phases!: FeedingPhaseItemDto[];
}
