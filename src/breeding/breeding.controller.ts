import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { BreedingBatchStatus, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BreedingService } from './breeding.service';
import { CreateBreedingBatchDto } from './dto/create-breeding-batch.dto';
import { CreateBreedingRecordDto } from './dto/create-breeding-record.dto';
import { CloseBreedingBatchDto } from './dto/close-breeding-batch.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

const BREEDING_SORT_FIELDS = ['startDate', 'reference', 'currentCount', 'totalCost', 'costPerHead'] as const;
type BreedingSortField = (typeof BREEDING_SORT_FIELDS)[number];

export class UpdateBreedingSettingsDto {
  @ApiPropertyOptional({ example: 2000, description: 'Poids cible commercial (grammes)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  targetWeightGrams?: number;

  @ApiPropertyOptional({ example: 45, description: 'Durée cible du cycle (jours)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  targetCycleDays?: number;

  @ApiPropertyOptional({ example: 5, description: 'Seuil d\'alerte mortalité (%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  mortalityAlertPercent?: number;

  @ApiPropertyOptional({ example: 2200, description: 'Prix de vente attendu (FCFA / kg vif)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedSalePricePerKg?: number;
}

class QueryBreedingDto extends PaginationDto {
  @ApiPropertyOptional({ enum: BreedingBatchStatus })
  @IsOptional()
  @IsEnum(BreedingBatchStatus)
  status?: BreedingBatchStatus;

  @ApiPropertyOptional({ description: 'Recherche : référence, souche, fournisseur poussins, note' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: BREEDING_SORT_FIELDS, default: 'startDate' })
  @IsOptional()
  @IsIn(BREEDING_SORT_FIELDS as unknown as string[])
  sortBy?: BreedingSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

@ApiTags('Breeding')
@ApiBearerAuth('JWT-auth')
@Controller('breeding')
export class BreedingController {
  constructor(private readonly service: BreedingService) {}

  @Post()
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({ summary: 'Créer une nouvelle bande d\'élevage' })
  create(@Body() dto: CreateBreedingBatchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Liste paginée des bandes' })
  findAll(@Query() query: QueryBreedingDto) {
    return this.service.findAll(query, query);
  }

  @Get('alerts')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({ summary: 'Bandes nécessitant attention (mortalité > 5% ou âge > 60j)' })
  getAlerts() {
    return this.service.getAlerts();
  }

  @Get(':id')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: "Détail d'une bande (mortalité, âge, coût/tête)" })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/records')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Tous les relevés de la bande' })
  getRecords(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getRecords(id);
  }

  @Post(':id/records')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER, UserRole.OPERATOR)
  @ApiOperation({
    summary: 'Enregistrer un relevé périodique',
    description:
      "Si un aliment est distribué, le stock du produit fini est ponctionné via FIFO et le coût ajouté à la bande.",
  })
  addRecord(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateBreedingRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.addRecord(id, dto, user.id);
  }

  @Patch(':id/settings')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({
    summary: 'Mettre à jour les paramètres de pilotage (poids cible, durée, seuils, prix attendu)',
  })
  updateSettings(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBreedingSettingsDto,
  ) {
    return this.service.updateSettings(id, dto);
  }

  @Patch(':id/close')
  @Roles(UserRole.DIRECTOR, UserRole.BREEDING_MANAGER)
  @ApiOperation({
    summary: 'Clôturer la bande',
    description:
      'Crée des lots PF "Poulet vivant" et/ou "Poulet abattu", fige le coût de revient/tête.',
  })
  close(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CloseBreedingBatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.close(id, dto, user.id);
  }
}
