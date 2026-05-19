import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { UserRole } from '@prisma/client';
import { FormulasService } from './formulas.service';
import { CreateFormulaDto } from './dto/create-formula.dto';
import { UpdateFormulaDto } from './dto/update-formula.dto';
import { Roles } from '../common/decorators/roles.decorator';

class QueryFormulasDto {
  @IsOptional()
  @IsUUID()
  finishedProductId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Formulas')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
@Controller('formulas')
export class FormulasController {
  constructor(private readonly service: FormulasService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une formule de fabrication' })
  create(@Body() dto: CreateFormulaDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Liste des formules (filtres : produit, actif)' })
  findAll(@Query() query: QueryFormulasDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'une formule avec coût matières estimé (prix moyens actuels)" })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Modifier une formule — crée une nouvelle version, archive l’ancienne',
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFormulaDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activer cette formule (désactive les autres versions du produit)' })
  activate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.activate(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une formule (impossible si utilisée ou active)' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
