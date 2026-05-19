import { ApiPropertyOptional } from '@nestjs/swagger';
import { RawStockMovementType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryMovementsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: RawStockMovementType })
  @IsOptional()
  @IsEnum(RawStockMovementType)
  type?: RawStockMovementType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}
