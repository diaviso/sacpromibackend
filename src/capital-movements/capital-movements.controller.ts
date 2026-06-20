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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { CapitalMovementType, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { CapitalMovementsService } from './capital-movements.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

class CreateCapitalMovementDto {
  @ApiProperty({ enum: CapitalMovementType })
  @IsEnum(CapitalMovementType)
  type!: CapitalMovementType;

  @ApiProperty({ example: 1000000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  movementDate!: string;

  @ApiProperty({ description: 'Compte impacté' })
  @IsUUID()
  accountId!: string;

  @ApiPropertyOptional({ example: 'Ibrahima Sow' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contributorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentUrl?: string;
}

/**
 * Mise à jour cosmétique d'un mouvement de capital : contributeur,
 * description, document. Le montant et le compte impacté ne sont PAS
 * modifiables car ils ont créé une écriture de trésorerie immuable —
 * pour corriger une erreur de montant, créer un mouvement compensateur
 * (CONTRIBUTION pour rajouter, WITHDRAWAL pour réduire).
 */
class UpdateCapitalMovementDto {
  @ApiPropertyOptional({ example: 'Ibrahima Sow' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contributorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentUrl?: string;
}

export const CAPITAL_MOVEMENT_SORT_FIELDS = [
  'movementDate',
  'amount',
] as const;
export type CapitalMovementSortField = (typeof CAPITAL_MOVEMENT_SORT_FIELDS)[number];

class QueryCapitalMovementsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CapitalMovementType })
  @IsOptional()
  @IsEnum(CapitalMovementType)
  type?: CapitalMovementType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Recherche : référence, nom du tiers ou description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: CAPITAL_MOVEMENT_SORT_FIELDS, default: 'movementDate' })
  @IsOptional()
  @IsIn(CAPITAL_MOVEMENT_SORT_FIELDS as unknown as string[])
  sortBy?: CapitalMovementSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

@ApiTags('Capital Movements')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR)
@Controller('capital-movements')
export class CapitalMovementsController {
  constructor(private readonly service: CapitalMovementsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Enregistrer un mouvement de capital (apport, retrait, subvention, don, dividende)',
  })
  create(
    @Body() dto: CreateCapitalMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Liste paginée des mouvements de capital' })
  findAll(@Query() query: QueryCapitalMovementsDto) {
    return this.service.findAll(query, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      "Modifier les champs cosmétiques d'un mouvement (contributeur, description, document). Le montant et le compte impacté ne sont pas modifiables — créez un mouvement compensateur si nécessaire.",
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCapitalMovementDto,
  ) {
    return this.service.update(id, dto);
  }
}
