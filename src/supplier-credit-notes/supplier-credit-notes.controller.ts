import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SupplierCreditNotesService } from './supplier-credit-notes.service';
import { CreateSupplierCreditNoteDto } from './dto/create-supplier-credit-note.dto';
import { QuerySupplierCreditNotesDto } from './dto/query-supplier-credit-notes.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('Supplier Credit Notes')
@ApiBearerAuth('JWT-auth')
@Controller('supplier-credit-notes')
export class SupplierCreditNotesController {
  constructor(private readonly service: SupplierCreditNotesService) {}

  @Post()
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({
    summary: 'Creer un avoir fournisseur (retour marchandise)',
    description:
      'Effets atomiques : mouvement stock negatif sur les lots, decrement du stock, ' +
      'mise a jour de amountRemaining sur la reception parent (la dette diminue). ' +
      'Refuse si quantite > qty restante du lot.',
  })
  create(
    @Body() dto: CreateSupplierCreditNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Liste paginee des avoirs fournisseur' })
  findAll(@Query() query: QuerySupplierCreditNotesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.OPERATOR)
  @ApiOperation({ summary: "Detail d'un avoir fournisseur" })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }
}
