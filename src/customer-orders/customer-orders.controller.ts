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
import { CustomerOrderStatus, UserRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CustomerOrdersService } from './customer-orders.service';
import { CreateCustomerOrderDto } from './dto/create-customer-order.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

class QueryCustomerOrdersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CustomerOrderStatus })
  @IsOptional()
  @IsEnum(CustomerOrderStatus)
  status?: CustomerOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;
}

class CancelOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

@ApiTags('Customer Orders')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR, UserRole.SALES_MANAGER)
@Controller('customer-orders')
export class CustomerOrdersController {
  constructor(private readonly service: CustomerOrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une commande client (prix pré-rempli selon catégorie tarifaire)' })
  create(@Body() dto: CreateCustomerOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Liste paginée des commandes' })
  findAll(@Query() query: QueryCustomerOrdersDto) {
    return this.service.findAll(query, query.status, query.customerId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail commande (commandé vs livré)' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Confirmer la commande (PENDING → CONFIRMED)' })
  confirm(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.confirm(id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Annuler la commande (motif obligatoire)' })
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CancelOrderDto) {
    return this.service.cancel(id, dto.reason);
  }
}
