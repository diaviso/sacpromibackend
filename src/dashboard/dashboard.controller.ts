import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { DashboardService } from './dashboard.service';
import { Roles } from '../common/decorators/roles.decorator';

class DashboardQueryDto {
  @ApiPropertyOptional({ enum: ['today', 'week', 'month', 'custom'], default: 'month' })
  @IsOptional()
  @IsEnum(['today', 'week', 'month', 'custom'])
  period?: 'today' | 'week' | 'month' | 'custom';

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

class TrendsQueryDto {
  @ApiPropertyOptional({ enum: ['7d', '30d', '90d'], default: '30d' })
  @IsOptional()
  @IsEnum(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d';
}

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.DIRECTOR)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('kpi')
  @ApiOperation({
    summary: 'KPI globaux : CA, coûts matières/transformation, marge brute, charges, résultat net',
  })
  kpi(@Query() query: DashboardQueryDto) {
    return this.service.kpi(query.period ?? 'month', query.from, query.to);
  }

  @Get('profitability-by-activity')
  @ApiOperation({ summary: 'Rentabilité Production / Élevage / Commercial / Général' })
  profitability(@Query() query: DashboardQueryDto) {
    return this.service.profitabilityByActivity(query.period ?? 'month', query.from, query.to);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Tendances jour-par-jour (CA, coûts, charges, résultat net)' })
  trends(@Query() query: TrendsQueryDto) {
    return this.service.trends(query.period ?? '30d');
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Compteurs d’alertes (stocks, péremption, dettes, créances, élevage)' })
  alerts() {
    return this.service.alerts();
  }

  @Get('revenue-by-payment')
  @ApiOperation({ summary: 'CA par mode de paiement' })
  revenueByPayment(@Query() query: DashboardQueryDto) {
    return this.service.revenueByPayment(query.period ?? 'month', query.from, query.to);
  }

  @Get('treasury')
  @ApiOperation({ summary: 'Trésorerie : entrées, sorties, solde, dettes, créances' })
  treasury(@Query() query: DashboardQueryDto) {
    return this.service.treasury(query.period ?? 'month', query.from, query.to);
  }

  @Get('supplier-debts')
  @ApiOperation({ summary: 'Dettes fournisseurs (total, par fournisseur, en retard)' })
  supplierDebts() {
    return this.service.supplierDebts();
  }

  @Get('customer-receivables')
  @ApiOperation({ summary: 'Créances clients par ancienneté (<30j, 30-60j, >60j)' })
  customerReceivables() {
    return this.service.customerReceivables();
  }
}
