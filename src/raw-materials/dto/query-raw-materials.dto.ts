import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { RawMaterialCategory } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryRawMaterialsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Recherche par nom ou code' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: RawMaterialCategory })
  @IsOptional()
  @IsEnum(RawMaterialCategory)
  category?: RawMaterialCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Tri',
    enum: ['name', 'currentStock', 'averagePrice', 'createdAt'],
  })
  @IsOptional()
  @IsString()
  sortBy?: 'name' | 'currentStock' | 'averagePrice' | 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
