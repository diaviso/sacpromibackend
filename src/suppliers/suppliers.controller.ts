import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuerySuppliersDto } from './dto/query-suppliers.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Suppliers')
@ApiBearerAuth('JWT-auth')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Créer un fournisseur (DIRECTOR)' })
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Get()
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Liste paginée des fournisseurs' })
  findAll(@Query() query: QuerySuppliersDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Fiche fournisseur avec statistiques' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.suppliersService.findOne(id);
  }

  @Get(':id/invoices')
  @Roles(UserRole.DIRECTOR, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: "Historique des factures d'un fournisseur" })
  getInvoices(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.suppliersService.getInvoices(id, pagination);
  }

  @Get(':id/payments')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: "Historique des paiements à un fournisseur" })
  getPayments(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.suppliersService.getPayments(id, pagination);
  }

  @Patch(':id')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Modifier un fournisseur (DIRECTOR)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Désactiver un fournisseur' })
  deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.suppliersService.deactivate(id);
  }

  @Patch(':id/activate')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Réactiver un fournisseur' })
  activate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.suppliersService.activate(id);
  }

  @Delete(':id')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({
    summary: 'Supprimer un fournisseur (uniquement si aucune facture liée)',
  })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.suppliersService.remove(id);
  }
}
