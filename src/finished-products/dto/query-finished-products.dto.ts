import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { FinishedProductCategory } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const FINISHED_PRODUCT_SORT_FIELDS = [
  'name',
  'code',
  'currentStock',
  'wholesalePrice',
  'retailPrice',
  'averageCost',
  'createdAt',
] as const;
export type FinishedProductSortField = (typeof FINISHED_PRODUCT_SORT_FIELDS)[number];

export class QueryFinishedProductsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: FinishedProductCategory })
  @IsOptional()
  @IsEnum(FinishedProductCategory)
  category?: FinishedProductCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: FINISHED_PRODUCT_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(FINISHED_PRODUCT_SORT_FIELDS as unknown as string[])
  sortBy?: FinishedProductSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
