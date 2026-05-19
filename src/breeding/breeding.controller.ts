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
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { BreedingBatchStatus, UserRole } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { BreedingService } from './breeding.service';
import { CreateBreedingBatchDto } from './dto/create-breeding-batch.dto';
import { CreateBreedingRecordDto } from './dto/create-breeding-record.dto';
import { CloseBreedingBatchDto } from './dto/close-breeding-batch.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

class QueryBreedingDto extends PaginationDto {
  @ApiPropertyOptional({ enum: BreedingBatchStatus })
  @IsOptional()
  @IsEnum(BreedingBatchStatus)
  status?: BreedingBatchStatus;
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
    return this.service.findAll(query, query.status);
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
