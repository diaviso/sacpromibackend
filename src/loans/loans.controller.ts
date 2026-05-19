import {
  Body,
  Controller,
  Get,
  Param,
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
import { LoanStatus, PaymentMethod, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LoansService } from './loans.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

class CreateLoanDto {
  @ApiProperty({ example: 'CBAO Sénégal' })
  @IsString()
  @Length(2, 100)
  lenderName!: string;

  @ApiProperty({ example: 5000000, description: 'Capital emprunté' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  principalAmount!: number;

  @ApiProperty({
    example: 0.085,
    description: 'Taux annuel en décimal (0.085 = 8,5 %)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  annualInterestRate!: number;

  @ApiProperty({ example: 36, description: 'Durée en mois' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  termMonths!: number;

  @ApiProperty({ example: '2026-05-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  firstPaymentDate!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  paymentDayOfMonth?: number;

  @ApiPropertyOptional({ description: 'ID du compte qui reçoit les fonds' })
  @IsOptional()
  @IsUUID()
  disbursementAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractScanUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

class CreateLoanPaymentDto {
  @ApiProperty()
  @IsUUID()
  loanId!: string;

  @ApiProperty({ example: 150000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  paymentDate!: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class QueryLoansDto extends PaginationDto {
  @ApiPropertyOptional({ enum: LoanStatus })
  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;
}

class QueryLoanPaymentsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  loanId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

@ApiTags('Loans')
@ApiBearerAuth('JWT-auth')
@Controller('loans')
export class LoansController {
  constructor(private readonly service: LoansService) {}

  @Post()
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({
    summary:
      'Créer un prêt (échéancier auto-généré, fonds crédités sur le compte si fourni)',
  })
  create(@Body() dto: CreateLoanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Liste paginée des prêts' })
  findAll(@Query() query: QueryLoansDto) {
    return this.service.findAll(query, query);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Liste paginée des remboursements de prêts' })
  listPayments(@Query() query: QueryLoanPaymentsDto) {
    return this.service.listPayments(query, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail prêt + échéancier complet + paiements' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('payments')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({
    summary:
      'Enregistrer un remboursement (imputation auto sur intérêts puis capital)',
  })
  addPayment(
    @Body() dto: CreateLoanPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.addPayment(dto, user.id);
  }
}
