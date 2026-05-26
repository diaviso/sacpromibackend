import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { AccountType, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { AccountsService } from './accounts.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AnyAuthenticated } from '../common/decorators/any-authenticated.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

class CreateAccountDto {
  @ApiProperty({ example: 'Caisse principale' })
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiProperty({ enum: AccountType, example: AccountType.CASH })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiPropertyOptional({ example: 'CBAO' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @ApiPropertyOptional({ example: 'SN012 12345 67890123456789 12' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @ApiPropertyOptional({ example: 'XOF', default: 'XOF' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ example: 250000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  openingBalance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class UpdateAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export const ACCOUNT_SORT_FIELDS = [
  'name',
  'createdAt',
  'openingBalance',
] as const;
export type AccountSortField = (typeof ACCOUNT_SORT_FIELDS)[number];

class QueryAccountsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: AccountType })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Recherche : nom, banque, n° de compte ou note',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: ACCOUNT_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(ACCOUNT_SORT_FIELDS as unknown as string[])
  sortBy?: AccountSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

@ApiTags('Accounts')
@ApiBearerAuth('JWT-auth')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Post()
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Créer un compte de trésorerie' })
  create(@Body() dto: CreateAccountDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @AnyAuthenticated()
  @ApiOperation({
    summary: 'Liste paginée des comptes (avec soldes courants)',
  })
  findAll(@Query() query: QueryAccountsDto) {
    return this.service.findAll(query, query);
  }

  @Get(':id')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Détail d\'un compte (+ 20 dernières entrées)' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Mettre à jour un compte' })
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Supprimer un compte (refusé si mouvements existants)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
