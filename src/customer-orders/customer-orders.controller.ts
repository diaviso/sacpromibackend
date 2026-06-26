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
import { CustomerOrderPriority, CustomerOrderStatus, UserRole } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CustomerOrdersService } from './customer-orders.service';
import { CreateCustomerOrderDto } from './dto/create-customer-order.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

const CUSTOMER_ORDER_SORT_FIELDS = ['orderDate', 'reference', 'totalAmount', 'status', 'priority'] as const;
type CustomerOrderSortField = (typeof CUSTOMER_ORDER_SORT_FIELDS)[number];

class QueryCustomerOrdersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CustomerOrderStatus })
  @IsOptional()
  @IsEnum(CustomerOrderStatus)
  status?: CustomerOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Filtrer par responsable assigné' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ enum: CustomerOrderPriority })
  @IsOptional()
  @IsEnum(CustomerOrderPriority)
  priority?: CustomerOrderPriority;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional({ enum: CUSTOMER_ORDER_SORT_FIELDS, default: 'orderDate' })
  @IsOptional()
  @IsIn(CUSTOMER_ORDER_SORT_FIELDS as unknown as string[])
  sortBy?: CustomerOrderSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

class CancelOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

class ChangeStatusDto {
  @ApiProperty({ enum: CustomerOrderStatus })
  @IsEnum(CustomerOrderStatus)
  status!: CustomerOrderStatus;

  @ApiPropertyOptional({ description: "Motif (obligatoire si CANCELLED)" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class AssignOrderDto {
  @ApiPropertyOptional({ description: 'ID de l\'utilisateur — null pour désassigner' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;
}

class SetPriorityDto {
  @ApiProperty({ enum: CustomerOrderPriority })
  @IsEnum(CustomerOrderPriority)
  priority!: CustomerOrderPriority;
}

class SetInternalNoteDto {
  @ApiProperty({ description: 'Note interne (chaîne vide pour effacer)' })
  @IsString()
  @MaxLength(2000)
  internalNote!: string;
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
    return this.service.findAll(query, query);
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

  @Patch(':id')
  @ApiOperation({
    summary: 'Modifier une commande PENDING (lignes, dates, client). Refusé au-delà.',
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: import('./dto/update-customer-order.dto').UpdateCustomerOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Annuler la commande (motif obligatoire)' })
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CancelOrderDto) {
    return this.service.cancel(id, dto.reason);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Changer le statut de la commande (drag & drop Kanban). Valide la transition selon la state machine.',
  })
  changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.service.changeStatus(id, dto.status, dto.reason);
  }

  @Patch(':id/assign')
  @ApiOperation({
    summary:
      'Assigner un responsable a la commande (ou desassigner avec null)',
  })
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignOrderDto,
  ) {
    return this.service.assign(id, dto.assignedToId ?? null);
  }

  @Patch(':id/priority')
  @ApiOperation({ summary: 'Changer la priorite (LOW/NORMAL/HIGH/URGENT)' })
  setPriority(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetPriorityDto,
  ) {
    return this.service.setPriority(id, dto.priority);
  }

  @Patch(':id/internal-note')
  @ApiOperation({ summary: 'Definir / effacer la note interne' })
  setInternalNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetInternalNoteDto,
  ) {
    return this.service.setInternalNote(
      id,
      dto.internalNote.trim().length === 0 ? null : dto.internalNote.trim(),
    );
  }
}
