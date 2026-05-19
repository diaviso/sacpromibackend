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
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { CustomerPriceCategory, CustomerType, UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';

class QueryCustomersDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CustomerType })
  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @ApiPropertyOptional({ enum: CustomerPriceCategory })
  @IsOptional()
  @IsEnum(CustomerPriceCategory)
  priceCategory?: CustomerPriceCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Customers')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR, UserRole.SALES_MANAGER)
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un client' })
  create(@Body() dto: CreateCustomerDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Liste paginée des clients' })
  findAll(@Query() query: QueryCustomersDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fiche client (CA, volume, créances)' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/invoices')
  @ApiOperation({ summary: "Historique factures d'un client" })
  getInvoices(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.getInvoices(id, pagination);
  }

  @Get(':id/payments')
  @ApiOperation({ summary: "Historique paiements d'un client" })
  getPayments(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.getPayments(id, pagination);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un client' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: Partial<CreateCustomerDto>,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.deactivate(id);
  }

  @Patch(':id/activate')
  activate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.activate(id);
  }

  @Delete(':id')
  @Roles(UserRole.DIRECTOR)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
