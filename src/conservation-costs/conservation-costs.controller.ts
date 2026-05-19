import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsDateString, IsOptional } from 'class-validator';
import { ConservationCostsService } from './conservation-costs.service';
import { CreateConservationCostDto } from './dto/create-conservation-cost.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

class QueryConservationCostsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

@ApiTags('Conservation Costs')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR)
@Controller('conservation-costs')
export class ConservationCostsController {
  constructor(private readonly service: ConservationCostsService) {}

  @Post()
  @ApiOperation({
    summary: 'Saisir un coût de conservation par période (stockage + manutention)',
  })
  create(
    @Body() dto: CreateConservationCostDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Liste paginée des coûts de conservation' })
  findAll(@Query() query: QueryConservationCostsDto) {
    return this.service.findAll(query, query.from, query.to);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un coût de conservation" })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/allocation')
  @ApiOperation({
    summary: 'Calculer la répartition au prorata des stocks courants',
  })
  allocate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.allocate(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une saisie de coût de conservation' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
