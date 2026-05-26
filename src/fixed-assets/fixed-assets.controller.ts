import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  DepreciationMethod,
  FixedAssetCategory,
  FixedAssetStatus,
  UserRole,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FixedAssetsService } from './fixed-assets.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AnyAuthenticated } from '../common/decorators/any-authenticated.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

class CreateFixedAssetDto {
  @ApiProperty({ example: 'Camion Iveco Daily 35S15' })
  @IsString()
  @Length(2, 200)
  name!: string;

  @ApiProperty({ enum: FixedAssetCategory })
  @IsEnum(FixedAssetCategory)
  category!: FixedAssetCategory;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  acquisitionDate!: string;

  @ApiProperty({ example: 12000000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  acquisitionCost!: number;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salvageValue?: number;

  @ApiProperty({ example: 60, description: 'Durée d\'utilité en mois (60 = 5 ans)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  usefulLifeMonths!: number;

  @ApiPropertyOptional({ enum: DepreciationMethod, default: DepreciationMethod.STRAIGHT_LINE })
  @IsOptional()
  @IsEnum(DepreciationMethod)
  method?: DepreciationMethod;

  @ApiPropertyOptional({ example: 0.2, description: 'Taux dégressif annuel (requis si DECLINING_BALANCE)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  decliningRate?: number;

  @ApiPropertyOptional({ description: 'Compte d\'où l\'achat a été payé (génère écriture trésorerie)' })
  @IsOptional()
  @IsUUID()
  paymentAccountId?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Créer une écriture trésorerie pour l\'achat (mettre false si déjà enregistré ailleurs)',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  recordPurchaseAsTreasury?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

class DisposeFixedAssetDto {
  @ApiProperty({ example: '2027-06-15' })
  @IsDateString()
  disposalDate!: string;

  @ApiPropertyOptional({ example: 3500000, description: 'Prix de cession (uniquement pour SOLD)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  disposalAmount?: number;

  @ApiProperty({ enum: ['SOLD', 'SCRAPPED', 'WRITTEN_OFF'] })
  @IsIn(['SOLD', 'SCRAPPED', 'WRITTEN_OFF'])
  reason!: 'SOLD' | 'SCRAPPED' | 'WRITTEN_OFF';

  @ApiPropertyOptional({ description: 'Compte qui reçoit le prix de cession (si SOLD)' })
  @IsOptional()
  @IsUUID()
  proceedsAccountId?: string;
}

class RunDepreciationDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}

export const FIXED_ASSET_SORT_FIELDS = [
  'acquisitionDate',
  'acquisitionCost',
  'name',
  'reference',
] as const;
export type FixedAssetSortField = (typeof FIXED_ASSET_SORT_FIELDS)[number];

class QueryFixedAssetsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: FixedAssetCategory })
  @IsOptional()
  @IsEnum(FixedAssetCategory)
  category?: FixedAssetCategory;

  @ApiPropertyOptional({ enum: FixedAssetStatus })
  @IsOptional()
  @IsEnum(FixedAssetStatus)
  status?: FixedAssetStatus;

  @ApiPropertyOptional({
    description: 'Recherche : référence, nom, n° de série, emplacement ou note',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: FIXED_ASSET_SORT_FIELDS, default: 'acquisitionDate' })
  @IsOptional()
  @IsIn(FIXED_ASSET_SORT_FIELDS as unknown as string[])
  sortBy?: FixedAssetSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

@ApiTags('Fixed Assets')
@ApiBearerAuth('JWT-auth')
@Controller('fixed-assets')
export class FixedAssetsController {
  constructor(private readonly service: FixedAssetsService) {}

  @Post()
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Créer une immobilisation (avec écriture trésorerie optionnelle)' })
  create(@Body() dto: CreateFixedAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @AnyAuthenticated()
  @ApiOperation({
    summary: 'Liste paginée des immobilisations (avec valeur nette comptable)',
  })
  findAll(@Query() query: QueryFixedAssetsDto) {
    return this.service.findAll(query, query);
  }

  @Get(':id')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Détail immobilisation + historique amortissements' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/dispose')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Sortir une immobilisation (cession / mise au rebut)' })
  dispose(
    @Param('id') id: string,
    @Body() dto: DisposeFixedAssetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.dispose(id, dto, user.id);
  }

  @Post('run-depreciation')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({
    summary:
      'Générer manuellement les dotations aux amortissements pour un mois donné (idempotent)',
  })
  runDepreciation(
    @Body() dto: RunDepreciationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.runMonthlyDepreciation(dto.year, dto.month, user.id);
  }
}
