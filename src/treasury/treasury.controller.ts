import {
  Body,
  Controller,
  Get,
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
import { TreasuryEntrySource, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { TreasuryService } from './treasury.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AnyAuthenticated } from '../common/decorators/any-authenticated.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

class CreateTransferDto {
  @ApiProperty()
  @IsUUID()
  fromAccountId!: string;

  @ApiProperty()
  @IsUUID()
  toAccountId!: string;

  @ApiProperty({ example: 100000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  transferDate!: string;

  @ApiPropertyOptional({ example: 500, description: 'Frais de transfert (optionnel)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fees?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

class QueryEntriesDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ enum: TreasuryEntrySource })
  @IsOptional()
  @IsEnum(TreasuryEntrySource)
  source?: TreasuryEntrySource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

class QueryTransfersDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

class QueryDashboardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

@ApiTags('Treasury')
@ApiBearerAuth('JWT-auth')
@Controller('treasury')
export class TreasuryController {
  constructor(private readonly service: TreasuryService) {}

  @Get('dashboard')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Tableau de bord financier consolidé' })
  dashboard(@Query() query: QueryDashboardDto) {
    return this.service.getDashboard(query);
  }

  @Get('entries')
  @AnyAuthenticated()
  @ApiOperation({
    summary: 'Grand livre de trésorerie (toutes écritures, paginé)',
  })
  listEntries(@Query() query: QueryEntriesDto) {
    return this.service.listEntries(query, query);
  }

  @Get('transfers')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Liste paginée des transferts inter-comptes' })
  listTransfers(@Query() query: QueryTransfersDto) {
    return this.service.listTransfers(query, query);
  }

  @Post('transfers')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Effectuer un transfert entre deux comptes' })
  createTransfer(
    @Body() dto: CreateTransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createTransfer(dto, user.id);
  }
}
