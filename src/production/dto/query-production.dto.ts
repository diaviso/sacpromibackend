import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductionOrderStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const PRODUCTION_ORDER_SORT_FIELDS = [
  'productionDate',
  'reference',
  'totalCost',
  'unitCost',
  'status',
] as const;
export type ProductionOrderSortField = (typeof PRODUCTION_ORDER_SORT_FIELDS)[number];

export class QueryProductionOrdersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ProductionOrderStatus })
  @IsOptional()
  @IsEnum(ProductionOrderStatus)
  status?: ProductionOrderStatus;

  @ApiPropertyOptional({ description: 'ID produit fini' })
  @IsOptional()
  @IsUUID()
  finishedProductId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Recherche : référence, note' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: PRODUCTION_ORDER_SORT_FIELDS, default: 'productionDate' })
  @IsOptional()
  @IsIn(PRODUCTION_ORDER_SORT_FIELDS as unknown as string[])
  sortBy?: ProductionOrderSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
