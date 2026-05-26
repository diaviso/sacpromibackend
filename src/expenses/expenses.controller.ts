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
import { ExpenseActivity, ExpenseStatus, UserRole } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ExpensesService } from './expenses.service';
import { CreateCategoryDto, CreateExpenseDto } from './dto/create-expense.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

const EXPENSE_SORT_FIELDS = ['expenseDate', 'amount', 'createdAt'] as const;
type ExpenseSortField = (typeof EXPENSE_SORT_FIELDS)[number];

class QueryExpensesDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ExpenseActivity })
  @IsOptional()
  @IsEnum(ExpenseActivity)
  activity?: ExpenseActivity;

  @ApiPropertyOptional({ enum: ExpenseStatus })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Recherche : description, bénéficiaire' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: EXPENSE_SORT_FIELDS, default: 'expenseDate' })
  @IsOptional()
  @IsIn(EXPENSE_SORT_FIELDS as unknown as string[])
  sortBy?: ExpenseSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

class ConfirmExpenseDto {
  @ApiPropertyOptional({ description: 'Ajuster le montant à la confirmation' })
  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: 'Compte d\'où sort la dépense (génère écriture trésorerie)' })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}

@ApiTags('Expenses')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR)
@Controller()
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Post('expenses')
  @ApiOperation({ summary: 'Créer une dépense' })
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @Post('expenses/recurring')
  @ApiOperation({ summary: 'Créer une dépense récurrente (générée chaque 1er du mois)' })
  createRecurring(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create({ ...dto, isRecurring: true }, user.id);
  }

  @Get('expenses')
  @ApiOperation({ summary: 'Liste paginée des dépenses' })
  findAll(@Query() query: QueryExpensesDto) {
    return this.service.findAll(query, query);
  }

  @Get('expenses/:id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch('expenses/:id/confirm')
  @ApiOperation({ summary: 'Confirmer une dépense PENDING_CONFIRMATION (ajustement montant possible)' })
  confirm(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConfirmExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.confirm(id, dto, user.id);
  }

  @Delete('expenses/:id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }

  // CATEGORIES
  @Post('expense-categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Get('expense-categories')
  findAllCategories() {
    return this.service.findAllCategories();
  }

  @Patch('expense-categories/:id')
  updateCategory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: Partial<CreateCategoryDto>,
  ) {
    return this.service.updateCategory(id, dto);
  }

  @Delete('expense-categories/:id')
  deleteCategory(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.deleteCategory(id);
  }
}
